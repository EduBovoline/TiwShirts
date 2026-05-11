/* ========================
   LANDING PAGE SCRIPT
   TiwShirts Drop #01
======================== */

/* ---- SCROLL-TRIGGERED NAV ---- */
window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    nav.classList.toggle('scrolled', window.scrollY > 60);
});

/* ---- REVEAL ON SCROLL ---- */
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            revealObserver.unobserve(e.target);
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal-up').forEach(el => revealObserver.observe(el));

/* ---- HERO PARALLAX ---- */
window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const heroBg = document.querySelector('.hero-bg-img');
    if (heroBg && scrolled < window.innerHeight) {
        heroBg.style.transform = `scale(1.08) translateY(${scrolled * 0.18}px)`;
    }
});

/* ---- SCROLL TO TOP ---- */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
