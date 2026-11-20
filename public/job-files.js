'use strict';
window.jobFileLinks = function(files, target) {
  for (const file of files || []) {
    const link = document.createElement('button');
    link.type = 'button'; link.className = 'secondary'; link.textContent = 'Download ' + file.name;
    link.addEventListener('click', () => {
      const bytes = Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
      const a = document.createElement('a'); a.href=url; a.download=file.name; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    target.append(link);
  }
};
