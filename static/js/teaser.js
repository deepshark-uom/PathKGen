/* Teaser figure: types out the generated report */
(function(){
  var el=document.getElementById('tz');if(!el)return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var full=el.querySelector('.tz-full'),typed=el.querySelector('.tz-typed');
  el.classList.add('anim');
  var segs=[];
  Array.prototype.forEach.call(full.childNodes,function(n){
    if(n.nodeType===3)segs.push({t:n.textContent});
    else if(n.nodeType===1)segs.push({t:n.textContent,c:n.className,k:(n.getAttribute('data-k')||'').split(' ').filter(Boolean)});
  });
  var seen=true,waiters=[];
  if('IntersectionObserver' in window){
    seen=false;
    new IntersectionObserver(function(e){
      seen=e[0].isIntersecting;
      if(seen){var w=waiters;waiters=[];w.forEach(function(f){f()})}
    },{threshold:.2}).observe(el);
  }
  function sleep(ms){return new Promise(function(r){setTimeout(function(){seen?r():waiters.push(r)},ms)})}
  function hot(ks,on){ks.forEach(function(k){Array.prototype.forEach.call(el.querySelectorAll('[data-k="'+k+'"]'),function(n){n.classList.toggle('hot',on)})})}
  var cur=document.createElement('span');cur.className='tz-cur';
  async function typeAll(){
    typed.textContent='';typed.appendChild(cur);
    for(var s=0;s<segs.length;s++){
      var seg=segs[s],span=document.createElement('span');
      if(seg.c)span.className=seg.c;
      typed.insertBefore(span,cur);
      hot(seg.k||[],true);
      for(var i=0;i<seg.t.length;){
        var step=2+(Math.random()<.3?1:0);
        span.textContent+=seg.t.slice(i,i+step);i+=step;
        var ch=seg.t.charAt(i-1);
        await sleep(ch==='.'?280:ch===','?120:22+Math.random()*14);
      }
      hot(seg.k||[],false);
    }
  }
  (async function(){
    for(;;){
      typed.textContent='';
      await sleep(1000);
      await typeAll();
      await sleep(8000);
    }
  })();
})();
