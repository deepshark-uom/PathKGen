/* Pipeline figure: step-by-step highlight animation */
(function(){
  var svg=document.querySelector('.pl-svg');if(!svg)return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var NS='http://www.w3.org/2000/svg',B='#4a5bd8',A='#d9962f',C='#e0674c',P='#7c3aed';
  svg.classList.add('anim');
  var seen=!('IntersectionObserver' in window),waiters=[];
  if(!seen)new IntersectionObserver(function(e){seen=e[0].isIntersecting;if(seen){var w=waiters;waiters=[];w.forEach(function(f){f()})}},{threshold:.25}).observe(svg);
  function sleep(ms){return new Promise(function(r){setTimeout(function(){seen?r():waiters.push(r)},ms)})}
  function q(k){return svg.querySelectorAll('[data-s~="'+k+'"]')}
  function lit(k){Array.prototype.forEach.call(q(k),function(n){n.classList.add('on')})}
  function travel(el,color,ms){
    return new Promise(function(res){
      var L=el.getTotalLength(),c=document.createElementNS(NS,'circle');
      c.setAttribute('r','5');c.setAttribute('fill',color);c.setAttribute('stroke','#fff');c.setAttribute('stroke-width','1.5');
      el.parentNode.appendChild(c);var n=Math.max(2,Math.round(ms/16)),k=0;
      var iv=setInterval(function(){
        k++;var p=k/n,e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2,pt=el.getPointAtLength(L*Math.min(1,e));
        c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y);
        if(k>=n){clearInterval(iv);c.remove();res()}
      },16);
    });
  }
  function go(k,color,ms){
    lit(k);var ps=[];
    Array.prototype.forEach.call(q(k),function(n){if(n.tagName==='line'||n.tagName==='path')ps.push(travel(n,color,ms||450))});
    return Promise.all(ps);
  }
  async function tokens(pre,n,color){
    for(var i=0;i<n;i++){lit(pre+i);go('a-'+pre+i,color,300);await sleep(190)}
    await sleep(300);
  }
  function reset(){
    svg.classList.remove('scan','glow');
    Array.prototype.forEach.call(svg.querySelectorAll('.on'),function(n){n.classList.remove('on')});
  }
  async function run(){
    for(;;){
      reset();await sleep(900);
      // slide -> patches
      svg.classList.add('scan');await sleep(1000);
      await go('a-wsi',B,500);
      for(var i=1;i<=6;i++){lit('tile'+i);await sleep(140)}
      await sleep(250);
      // vision branch
      await go('a-te',B,550);lit('pe');await sleep(200);
      await go('a-es',B,550);lit('se');await sleep(200);
      await go('a-vt',B,550);lit('pr');await sleep(200);
      await go('a-pv',B,750);
      await tokens('v',6,B);
      // knowledge branch
      await Promise.all([go('a-emb',A,1000),(async function(){await sleep(300);lit('ps');await go('a-psc',A,350)})()]);
      lit('emb');await sleep(250);
      await go('a-ec',A,350);lit('cl');await sleep(150);
      await go('a-ch',A,350);lit('hc');await sleep(150);
      await go('a-hp',A,350);lit('pg');await sleep(150);
      await go('a-pg',A,350);lit('sg0');
      for(var j=1;j<=6;j++){lit('sg'+j);await sleep(110)}
      await sleep(200);
      await go('a-gt',A,350);lit('tb');await sleep(350);
      await go('a-kt',A,650);
      await tokens('k',6,A);
      // prompt
      lit('pm');await sleep(350);
      await go('a-pt',C,650);
      await tokens('p',3,C);
      // LLM -> report
      lit('llm');svg.classList.add('glow');await sleep(1000);
      await go('a-doc',P,550);lit('doc');await sleep(250);
      for(var r=0;r<4;r++){lit('rb'+r);await sleep(280)}
      await sleep(400);svg.classList.remove('glow');
      await sleep(4500);
    }
  }
  run();
})();
