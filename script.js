// Young Hadene Website - Optimized JavaScript
// Use defer attribute for better performance

// Mobile Menu Toggle - Optimized
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        mobileMenu.classList.toggle('animate-fade-in-up');
    });
    
    // Close mobile menu when clicking on a link - Optimized with event delegation
    mobileMenu.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            mobileMenu.classList.add('hidden');
        }
    });
}

// Smooth Scrolling for anchor links - Optimized
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const target = document.getElementById(targetId);
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Add scroll effect to header - Throttled for performance
let scrollTimer;
window.addEventListener('scroll', () => {
    if (scrollTimer) {
        return;
    }
    
    scrollTimer = setTimeout(() => {
        const header = document.querySelector('header');
        if (header) {
            if (window.scrollY > 100) {
                header.classList.add('backdrop-blur-lg', 'bg-dark-bg/90', 'shadow-lg');
            } else {
                header.classList.remove('backdrop-blur-lg', 'bg-dark-bg/90', 'shadow-lg');
            }
        }
        scrollTimer = null;
    }, 16); // ~60fps
});

// Intersection Observer for fade-in animations - Optimized
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe only visible sections for better performance
const visibleSections = document.querySelectorAll('section:not(.hidden)');
visibleSections.forEach(section => {
    observer.observe(section);
});

// Video loading optimization - Enhanced
function optimizeVideoLoading() {
    const videos = document.querySelectorAll('iframe');
    
    videos.forEach(video => {
        // Add loading attribute for better performance
        video.setAttribute('loading', 'lazy');
        
        // Add error handling with fallback
        video.addEventListener('error', function() {
            this.parentElement.innerHTML = `
                <div class="bg-dark-surface rounded-lg p-8 text-center">
                    <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                    <p>Video temporarily unavailable. <a href="#featured" class="text-accent hover:text-accent-hover">Browse other videos</a></p>
                </div>
            `;
        });
        
        // Add load success handling
        video.addEventListener('load', function() {
            this.parentElement.classList.add('video-loaded');
        });
    });
}

// Initialize optimizations when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', optimizeVideoLoading);
} else {
    optimizeVideoLoading();
}

// Initialize video optimization
document.addEventListener('DOMContentLoaded', optimizeVideoLoading);

// Social media link tracking
function trackSocialClick(platform) {
    // Simple analytics tracking (you can replace with actual analytics)
    console.log(`Social media click: ${platform}`);
    
    // You can add Google Analytics or other tracking here
    // gtag('event', 'social_click', { platform: platform });
}

// Add click tracking to social links
document.querySelectorAll('a[href*="instagram.com"], a[href*="tiktok.com"], a[href*="youtube.com"], a[href*="spotify.com"], a[href*="apple.com"], a[href*="amazon.com"]').forEach(link => {
    link.addEventListener('click', function() {
        const platform = this.textContent.trim().toLowerCase();
        trackSocialClick(platform);
    });
});

// Dynamic year in footer
function updateFooterYear() {
    const yearElements = document.querySelectorAll('footer');
    const currentYear = new Date().getFullYear();
    
    yearElements.forEach(element => {
        const yearText = element.textContent;
        if (yearText.includes('2024')) {
            element.textContent = yearText.replace('2024', currentYear);
        }
    });
}

// Update footer year on load
document.addEventListener('DOMContentLoaded', updateFooterYear);

// Keyboard navigation support
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
    }
});

// Performance monitoring
function logPerformance() {
    if ('performance' in window) {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log(`Page load time: ${loadTime}ms`);
    }
}

// Log performance after page load
window.addEventListener('load', logPerformance);

// Responsive video sizing
function resizeVideos() {
    const videoContainers = document.querySelectorAll('.video-container, .shorts-container');
    
    videoContainers.forEach(container => {
        const iframe = container.querySelector('iframe');
        if (iframe) {
            const width = container.offsetWidth;
            const aspectRatio = container.classList.contains('shorts-container') ? 9/16 : 16/9;
            const height = width / aspectRatio;
            
            iframe.style.height = `${height}px`;
        }
    });
}

// Resize videos on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeVideos, 250);
});

// Initialize video sizing
document.addEventListener('DOMContentLoaded', resizeVideos);

// Add loading states to buttons
document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', function(e) {
        if (this.hostname !== window.location.hostname) {
            // External link - add loading state
            this.style.opacity = '0.7';
            setTimeout(() => {
                this.style.opacity = '1';
            }, 300);
        }
    });
});

// Console welcome message
console.log('%c🎵 Young Hadene - Official Website 🎵', 'font-size: 20px; color: #ff6b35; font-weight: bold;');
console.log('%cBuilt with ❤️ for Str8hitsRecords', 'font-size: 14px; color: #666;');
