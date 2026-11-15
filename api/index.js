'use strict';
const dispatch=require('../server');
module.exports=async(req,res)=>{
 const url=new URL(req.url,'https://superior-proconnect.vercel.app');
 const route=url.searchParams.get('__route');
 if(route){if(!route.startsWith('/api/')||route.includes('://')){res.statusCode=400;return res.end('Invalid route');}url.searchParams.delete('__route');req.url=route+(url.searchParams.size?'?'+url.searchParams.toString():'');}
 return dispatch(req,res);
};
