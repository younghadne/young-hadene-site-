# Young Hadene - Official Website younghadene.ca

A modern, responsive website for Young Hadene, Haitian-born, Toronto-based hip-hop and drill artist.

## Features

- **Dark Theme**: Modern high-contrast design
- **Mobile Responsive**: Works perfectly on all devices
- **Video Sections**: Featured videos and YouTube Shorts
- **Social Links**: Connect on all major platforms
- **Cloudflare Ready**: Optimized for Cloudflare Pages deployment

## Quick Start

### Local Development
```bash
# Open in browser
open index.html

# Or serve locally
python -m http.server 8080
```

### Deployment to Cloudflare Pages

1. Push to GitHub repository
2. Connect to Cloudflare Pages
3. Deploy automatically

## Content Updates

### Add YouTube Videos
Replace `VIDEO_ID_1`, `VIDEO_ID_2` in `index.html` with actual YouTube video IDs.

### Add YouTube Shorts
Replace `SHORTS_ID_1`, `SHORTS_ID_2` in `index.html` with actual Shorts video IDs.

### Update Social Links
Replace placeholder URLs in the streaming section with actual profile links.

### Update Biography
Edit the About section text in `index.html`.

## File Structure

```
young-hadene-landing/
├── index.html          # Main HTML file
├── styles.css          # Custom CSS styles
├── script.js           # JavaScript functionality
├── _redirects          # Cloudflare redirects
├── package.json        # Project metadata
└── README.md           # This file
```

## Customization

- Colors: Modify Tailwind config in `index.html`
- Fonts: Change Google Fonts imports
- Layout: Adjust Tailwind classes
- Animations: Edit `styles.css`

## Support

Managed by Str8hitsRecords
Contact: contact@younghadene.com

## 🚀 Features

- **Responsive Design**: Mobile-first approach that looks great on all devices
- **Dark Theme**: Modern dark theme with high contrast for better readability
- **YouTube Embed**: Featured video section with responsive YouTube player
- **Streaming Links**: Direct links to major streaming platforms (Spotify, Apple Music, YouTube Music, SoundCloud)
- **Social Media Integration**: Links to all major social media platforms
- **SEO Optimized**: Proper meta tags and semantic HTML structure
- **Performance Optimized**: Fast loading with CDN-hosted assets
- **Cloudflare Pages Ready**: Pre-configured for seamless deployment

## 📁 Project Structure

```
young-hadene-landing/
├── index.html          # Main landing page
├── wrangler.toml       # Cloudflare Pages configuration
├── _redirects          # URL redirection rules
├── _headers            # HTTP headers configuration
└── README.md           # This file
```

## 🛠️ Technologies Used

- **HTML5**: Semantic markup for accessibility and SEO
- **Tailwind CSS**: Utility-first CSS framework via CDN
- **Google Fonts**: Bebas Neue (display) and Inter (body) fonts
- **Font Awesome**: Icon library for social media and platform icons
- **Vanilla JavaScript**: Minimal JS for mobile menu and smooth scrolling

## 📱 Customization Guide

### 1. Update YouTube Video

Find this section in `index.html`:

```html
<!-- 
    EMBEDDING INSTRUCTIONS:
    Replace the YouTube video ID in the src attribute below with your actual video ID.
    The video ID is the part after "v=" in a YouTube URL.
    Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ -> ID is "dQw4w9WgXcQ"
-->
<iframe 
    class="w-full h-full"
    src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
    title="Young Hadene - Featured Video"
    frameborder="0" 
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
    allowfullscreen>
</iframe>
```

Replace `dQw4w9WgXcQ` with your actual YouTube video ID.

### 2. Update Streaming Platform Links

Find the streaming links section and replace the placeholder URLs:

```html
<!-- Spotify -->
<a href="https://open.spotify.com/artist/YOUR_ARTIST_ID" target="_blank" rel="noopener noreferrer">

<!-- Apple Music -->
<a href="https://music.apple.com/YOUR_ARTIST_ID" target="_blank" rel="noopener noreferrer">

<!-- YouTube Music -->
<a href="https://music.youtube.com/YOUR_CHANNEL_ID" target="_blank" rel="noopener noreferrer">

<!-- SoundCloud -->
<a href="https://soundcloud.com/YOUR_USERNAME" target="_blank" rel="noopener noreferrer">
```

### 3. Update Social Media Links

Find the social media section and update the URLs:

```html
<!-- YouTube -->
<a href="https://youtube.com/@YOUR_USERNAME" target="_blank" rel="noopener noreferrer">

<!-- Instagram -->
<a href="https://instagram.com/YOUR_USERNAME" target="_blank" rel="noopener noreferrer">

<!-- TikTok -->
<a href="https://tiktok.com/@YOUR_USERNAME" target="_blank" rel="noopener noreferrer">

<!-- Twitter/X -->
<a href="https://twitter.com/YOUR_USERNAME" target="_blank" rel="noopener noreferrer">

<!-- Facebook -->
<a href="https://facebook.com/YOUR_USERNAME" target="_blank" rel="noopener noreferrer">
```

### 4. Update Contact Information

Update the email address in the footer:

```html
<a href="mailto:contact@younghadene.com" class="hover:text-accent transition-colors">
    contact@younghadene.com
</a>
```

### 5. Customize Colors and Fonts

The color scheme is defined in the Tailwind configuration within `index.html`:

```javascript
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'dark-bg': '#0a0a0a',      // Main background
                'dark-surface': '#1a1a1a', // Card backgrounds
                'dark-border': '#2a2a2a',  // Borders
                'accent': '#ff6b35',        // Primary accent color
                'accent-hover': '#ff5722'   // Hover state
            }
        }
    }
}
```

## 🌐 Deployment to Cloudflare Pages

### Prerequisites

- A Cloudflare account (free tier is sufficient)
- A GitHub account (recommended for automatic deployments)

### Step-by-Step Deployment

#### Method 1: Direct Upload (Quick Start)

1. **Log in to Cloudflare Dashboard**
   - Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to **Workers & Pages**

2. **Create New Application**
   - Click **Create application**
   - Select the **Pages** tab
   - Choose **Upload assets**

3. **Upload Your Files**
   - Drag and drop all files from the project folder
   - Or click to select and upload:
     - `index.html`
     - `wrangler.toml`
     - `_redirects`
     - `_headers`

4. **Configure Deployment**
   - **Project name**: `young-hadene-landing` (or your preferred name)
   - **Production branch**: `main`
   - **Build command**: `exit 0` (already configured in `wrangler.toml`)
   - **Build output directory**: `.` (root directory)

5. **Deploy**
   - Click **Save and Deploy**
   - Wait for deployment to complete
   - Your site will be available at `https://young-hadene-landing.pages.dev`

#### Method 2: GitHub Integration (Recommended for Updates)

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Young Hadene landing page"
   git branch -M main
   git remote add origin https://github.com/yourusername/young-hadene-landing.git
   git push -u origin main
   ```

2. **Connect to Cloudflare Pages**
   - In Cloudflare Dashboard, go to **Workers & Pages**
   - Click **Create application** → **Pages** tab
   - Select **Connect to Git**
   - Choose your GitHub repository
   - Click **Begin setup**

3. **Configure Build Settings**
   - **Production branch**: `main`
   - **Build command**: `exit 0`
   - **Build output directory**: `.`
   - **Root directory**: `/` (leave empty)

4. **Deploy**
   - Click **Save and Deploy**
   - Your site will automatically deploy and be available at the provided URL

### Custom Domain (Optional)

1. **Add Custom Domain**
   - In your Cloudflare Pages project, go to **Custom domains**
   - Click **Set up a custom domain**
   - Enter your domain (e.g., `younghadene.com`)
   - Follow the DNS configuration instructions

2. **Update DNS Records**
   - Cloudflare will provide the necessary DNS records
   - Add them to your domain's DNS configuration
   - Wait for propagation (usually 5-15 minutes)

## 🔧 Configuration Files Explained

### `wrangler.toml`
```toml
# Build command for static sites
command = "exit 0"

# Output directory (root for this project)
publish = "."
```

### `_redirects`
```text
# Handle URL redirections
# Example: /old-page /new-page 301

# SPA routing (if needed in future)
# /* /index.html 200
```

### `_headers`
```text
# Security headers for all pages
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  X-XSS-Protection: "1; mode=block"
  Referrer-Policy: strict-origin-when-cross-origin

# Cache control for static assets
/*.css
  Cache-Control: public, max-age=31536000, immutable
```

## 🚀 Performance Optimizations

- **CDN Delivery**: All assets served via Cloudflare's global CDN
- **Caching Headers**: Optimized cache settings for different file types
- **Minimal JavaScript**: Only essential JS for interactions
- **Optimized Images**: Uses modern image formats and lazy loading
- **CSS Delivery**: Tailwind CSS via CDN for optimal loading

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## 🎨 Design System

### Colors
- **Primary Background**: `#0a0a0a` (dark-black)
- **Surface**: `#1a1a1a` (dark-gray)
- **Border**: `#2a2a2a` (medium-gray)
- **Accent**: `#ff6b35` (orange)
- **Accent Hover**: `#ff5722` (dark-orange)

### Typography
- **Display Font**: Bebas Neue (headings)
- **Body Font**: Inter (paragraphs and UI elements)

## 🐛 Troubleshooting

### Common Issues

1. **404 Errors**
   - Ensure `index.html` is in the root directory
   - Check that the build output directory is set to `.`

2. **YouTube Video Not Showing**
   - Verify the YouTube video ID is correct
   - Check that the video is public or unlisted

3. **Links Not Working**
   - Ensure all URLs include `https://`
   - Check that `target="_blank"` and `rel="noopener noreferrer"` are set

4. **Mobile Menu Not Working**
   - Check browser console for JavaScript errors
   - Ensure the mobile menu toggle button has the correct ID

### Performance Issues

1. **Slow Loading**
   - Check Cloudflare Analytics for bottlenecks
   - Optimize images if you add custom ones
   - Consider using Cloudflare's Image Resizing

2. **Mobile Responsiveness**
   - Test on actual devices, not just browser emulation
   - Check viewport meta tag is present

## 📞 Support

For issues with:
- **Cloudflare Pages**: [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- **GitHub Integration**: [GitHub Pages Documentation](https://docs.github.com/en/pages)
- **This Project**: Check the troubleshooting section above

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

**🎵 Made with love for Young Hadene's music career**
