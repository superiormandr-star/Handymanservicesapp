'use strict';
const crypto = require('node:crypto');

module.exports = async function estimateRoutes(req,res,util){
  const {db,save,send,body,admin,clean} = util;
  const url = new URL(req.url,'http://localhost');
  const path = url.pathname;
  const ownerBase = '/api/command/estimates';
  const publicBase = '/api/public-estimates/';
  if(path !== ownerBase && !path.startsWith(ownerBase+'/') && !path.startsWith(publicBase)) return false;
  const money = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
  const formatDocument = r => ({...r,approvalToken:undefined});
  const bad = (message,status=400) => {send(res,status,{error:message});return true};
  if(path === ownerBase){
    if(!admin(req)) return bad('Owner access required',401);
    if(req.method === 'GET'){
      const all=(db().documents||[]).filter(d=>d.type==='estimate'||d.type==='invoice').sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
      send(res,200,{documents:all});return true;
    }
    if(req.method !== 'POST') return bad('Method not allowed',405);
    const x = await body(req), d = db();
    d.documents = Array.isArray(d.documents)?d.documents:[];
    const id=clean(x.id,80),old=id?d.documents.find(o=>o.id===id && o.type==='estimate'):null;
    if(id && !old)return bad('Estimate not found',404);
    if(old && old.status==='approved')return bad('Approved estimates cannot be changed. Make a new estimate.',409);
    const client=clean(x.client,120),email=clean(x.clientEmail,150),phone=clean(x.clientPhone,50);
    if(client.length<2)return bad('Customer name required');
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return bad('Enter a valid customer email');
    if(!Array.isArray(x.items)||!x.items.length||x.items.length>40)return bad('Add 1 to 40 line items');
    const items = x.items.map(i=>({
      description:clean(i.description,220),
      section:clean(i.section,80),
      category:['Labor','Materials','Other'].includes(i.category)?i.category:'Labor',
      qty:Number(i.qty),unit:clean(i.unit,25)||'ea',rate:Number(i.rate)
    }));
    if(items.some(i=>!i.description||!Number.isFinite(i.qty)||i.qty<=0||i.qty>100000||!Number.isFinite(i.rate)||i.rate<0||i.rate>10000000))
      return bad('Enter a valid description, quantity and price for every line item');
    const markup=Number(x.markup||0),discount=Number(x.discount||0),taxRate=Number(x.taxRate||0),deposit=Number(x.deposit||0);
    if([markup,discount,taxRate,deposit].some(n=>!Number.isFinite(n)||n<0||n>100000000)||taxRate>100)return bad('Markup, discount, tax and deposit must be valid positive amounts');
    const subtotal=money(items.reduce((sum,i)=>sum+i.qty*i.rate,0));
    const taxable=money(subtotal+markup-discount);
    if(taxable<0)return bad('Discount exceeds the subtotal plus markup');
    const tax=money(taxable*taxRate/100), total=money(taxable+tax);
    if(deposit>total)return bad('Requested deposit cannot exceed estimate total');
    const now=new Date().toISOString();
    const count=d.documents.filter(t=>t.type==='estimate').length+1;
    const record={
      id:old?.id||crypto.randomUUID(),type:'estimate',
      number:old?.number||'EST-'+new Date().getFullYear()+'-'+String(count).padStart(4,'0'),
      status:'ready',client,clientEmail:email,clientPhone:phone,clientAddress:clean(x.clientAddress,250),
      project:clean(x.project,150),projectAddress:clean(x.projectAddress,250),
      date:clean(x.date,10),dueDate:clean(x.dueDate,10),license:clean(x.license,80),
      scope:clean(x.scope,1800),items,subtotal,markup,discount,taxRate,tax,total,
      deposit,payment:deposit,notes:clean(x.notes,1500),terms:clean(x.terms,1200),
      approvalToken:old?.approvalToken||crypto.randomBytes(32).toString('hex'),
      createdAt:old?.createdAt||now,updatedAt:now,decision:null,decidedAt:null,
      signer:null,invoiceId:null
    };
    if(old) Object.assign(old,record); else d.documents.push(record);
    save(d);send(res,200,{ok:true,document:record});return true;
  }
  const markPaid=path.match(/^\/api\/command\/estimates\/([a-f0-9-]{36})\/paid$/);
  if(markPaid){
    if(!admin(req))return bad('Owner access required',401);
    if(req.method!=='POST')return bad('Method not allowed',405);
    const d=db(),invoice=(d.documents||[]).find(t=>t.id===markPaid[1]&&t.type==='invoice');
    if(!invoice)return bad('Invoice not found',404);
    if(invoice.status==='paid')return bad('Invoice already marked paid',409);
    invoice.status='paid';invoice.paidAt=new Date().toISOString();invoice.updatedAt=invoice.paidAt;
    save(d);send(res,200,{ok:true,invoice:formatDocument(invoice)});return true;
  }
  if(path.startsWith(publicBase)){
    const match=path.match(/^\/api\/public-estimates\/([a-f0-9]{64})(\/decision)?$/);
    if(!match)return bad('Estimate link not found',404);
    const d=db(),record=(d.documents||[]).find(v=>v.type==='estimate'&&v.approvalToken===match[1]);
    if(!record)return bad('Estimate link not found',404);
    if(!match[2] && req.method==='GET'){
      const r=formatDocument(record);
      send(res,200,{document:r});return true;
    }
    if(match[2] && req.method==='POST'){
      if(record.status!=='ready')return bad('A decision has already been recorded for this estimate',409);
      const x=await body(req),decision=clean(x.decision,10),signer=clean(x.signer,120);
      if(!['approved','declined'].includes(decision))return bad('Choose approve or decline');
      if(decision==='approved'&&(signer.length<2||x.agreed!==true))return bad('Type your full name and accept the terms to approve');
      record.status=decision;record.signer=decision==='approved'?signer:null;
      record.decision=decision;record.decidedAt=new Date().toISOString();record.updatedAt=record.decidedAt;
      if(decision==='declined')record.declineReason=clean(x.reason,500);
      let invoiceNumber;
      if(decision==='approved'){
        const count=d.documents.filter(t=>t.type==='invoice').length+1;
        invoiceNumber='INV-'+new Date().getFullYear()+'-'+String(count).padStart(4,'0');
        const invoice={...record,id:crypto.randomUUID(),type:'invoice',number:invoiceNumber,
          status:'unpaid',payment:0,sourceEstimateId:record.id,sourceEstimateNumber:record.number,
          approvalToken:undefined,createdAt:record.decidedAt,updatedAt:record.decidedAt};
        record.invoiceId=invoice.id;
        d.documents.push(invoice);
      }
      save(d);send(res,200,{ok:true,status:decision,invoiceNumber});return true;
    }
    return bad('Method not allowed',405);
  }
  return bad('Not found',404);
};
