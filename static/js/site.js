/* Page behaviour: back-to-top button, image lightbox, BibTeX copy */
(function(){
  var top=document.getElementById('top'),lb=document.getElementById('lb'),lbi=lb.querySelector('img');
  window.addEventListener('scroll',function(){top.classList.toggle('on',window.scrollY>500)});
  top.onclick=function(){window.scrollTo({top:0,behavior:'smooth'})};
  document.querySelectorAll('figure img').forEach(function(i){
    i.addEventListener('click',function(){lbi.src=i.src;lbi.alt=i.alt;lb.classList.add('on')});
  });
  lb.onclick=function(){lb.classList.remove('on')};
  document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('on')});
  document.getElementById('copy').onclick=function(){
    var b=this,t=document.getElementById('bib').innerText;
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='Copied!'}).catch(function(){b.textContent='Press Ctrl+C'});
    setTimeout(function(){b.textContent='Copy'},1800);
  };
})();
