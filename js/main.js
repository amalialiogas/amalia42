// ── Starfield ──
function initStars() {
  const sf = document.getElementById('stars');
  if (!sf) return;
  for (let i = 0; i < 140; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--d:${2+Math.random()*4}s;--delay:-${Math.random()*6}s;--op:${0.15+Math.random()*0.5};`;
    sf.appendChild(s);
  }
  document.addEventListener('mousemove', e => {
    const x = (e.clientX / window.innerWidth - 0.5) * 14;
    const y = (e.clientY / window.innerHeight - 0.5) * 14;
    sf.style.transform = `translate(${x}px,${y}px)`;
  });
}

// ── Custom Cursor ──
function initCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor) return;
  const dot  = cursor.querySelector('.cursor-dot');
  const ring = cursor.querySelector('.cursor-ring');
  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    cursor.style.transform = `translate(${mx}px,${my}px)`;
    ring.parentElement.style.transform = `translate(${rx}px,${ry}px)`;
    requestAnimationFrame(loop);
  }
  // separate ring element approach
  cursor.style.position = 'fixed';
  cursor.style.top = '0'; cursor.style.left = '0';
  cursor.style.pointerEvents = 'none'; cursor.style.zIndex = '9999';

  document.addEventListener('mousemove', e => {
    cursor.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 4}px)`;
  });

  document.querySelectorAll('a,button,.card,.photo-item,.tag').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
  });
}

// ── Active nav link ──
function initNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}

// ── Intersection Observer for scroll reveal ──
function initScrollReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = `opacity 0.6s ease ${i * 0.08}s, transform 0.6s ease ${i * 0.08}s`;
    obs.observe(el);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initStars();
  initCursor();
  initNav();
  initScrollReveal();
});
