# Unutilmas Ta'm — Development Guide for Claude

## Project Overview

**Unutilmas Ta'm** is a Progressive Web App (PWA) written in vanilla JavaScript that serves as a comprehensive system for managing national Uzbek dishes, including:
- **Dish Catalog**: Searchable repository of traditional national dishes
- **Order Management**: System for placing and tracking food orders
- **Debt Tracking**: Financial management system for tracking customer debts

### Key Details
- **Language**: Uzbek (uz)
- **Type**: Single-Page Application (SPA)
- **Hosting**: Firebase Hosting (site: unutilmastam)
- **Architecture**: Vanilla JavaScript (no framework dependencies)
- **Deployment**: Progressive Web App with offline-first capabilities

---

## Technology Stack

### Core Technologies
- **HTML5**: Semantic markup, PWA metadata
- **CSS3**: Responsive design (mobile-first)
- **JavaScript (ES6+)**: Vanilla JS, no external frameworks
- **Service Workers**: Offline functionality and caching strategies
- **Firebase Hosting**: Cloud deployment platform

### Third-Party Integrations
- **Yandex Maps API v2.1**: Location-based services and map rendering
  - Maps adapter in index.html converts Leaflet-like API calls to Yandex Maps
  - Default center: Tashkent (41.3111, 69.2797)
  - Default zoom level: 12
- **Google Fonts**: Plus Jakarta Sans, Inter (CDN-hosted)
- **Google AdSense**: Monetization (client ID: ca-pub-5038263107741699)
- **Cloudflare CDN**: Asset delivery for libraries and fonts

### Build & Deployment
- **Git-based Workflow**: File uploads via git commits
- **Firebase JSON Config**: Configuration for hosting and deployment rules

---

## Project Structure

```
.
├── index.html              # Main application file (contains all HTML, CSS, JS)
├── sw.js                   # Service Worker (cache management, offline support)
├── firebase.json           # Firebase hosting configuration
├── manifest.webmanifest    # PWA manifest (app metadata, icons)
│
├── Assets (Icons)
│ ├── apple-touch-icon.png     # iOS home screen icon
│ ├── icon-192.png             # PWA icon (192x192)
│ ├── icon-512.png             # PWA icon (512x512)
│ └── icon-512-maskable.png    # Adaptive icon for Android
│
├── CNAME                   # Custom domain configuration
├── UnutilmasTam.apk        # Android APK build
└── .git/                   # Git repository metadata
```

### Critical Files

#### 1. **index.html** (~1MB)
The monolithic application file containing:
- **HTML Structure**: PWA metadata, manifest link, app container
- **Inline Styles**: Complete CSS for UI components and responsive design
- **Inline JavaScript**: 
  - Yandex Maps adapter (Leaflet-compatible wrapper)
  - Data management (dishes, orders, debts)
  - UI event handling and state management
  - Geolocation and location-based features
  - Local storage interactions

**Theme Colors**:
- Background: `#F5F1EA` (warm beige)
- Primary accent: `#EA5A1F` (orange, used for map pins)

#### 2. **sw.js** (Service Worker)
Implements caching strategy:
- **Cache Version**: `unutilmas-v43` (increment when updating app shell)
- **App Shell Strategy**: 
  - Network-first for `index.html` (get latest, fallback to cache)
  - App shell files cached: index.html, manifest.webmanifest, icon-192.png, icon-512.png
- **CDN Strategy**: 
  - Cache-first for Google Fonts and Cloudflare CDN
  - Prevents duplicate caching of new versions
- **External APIs**: 
  - Yandex Maps and Railway API bypass cache (always fetch fresh)
  - Supports offline browsing of cached content

#### 3. **manifest.webmanifest**
PWA configuration:
- Name: "Unutilmas Ta'm"
- Display mode: standalone (hides browser UI)
- Orientation: portrait
- Language: uz (Uzbek)
- Icons for various device sizes (192px, 512px, maskable for Android)

#### 4. **firebase.json**
Hosting configuration:
- Public directory: `.` (root)
- Ignores: firebase.json, hidden files (.*), node_modules

---

## Development Workflows

### Branching Strategy
- **Main Branch**: `main` (production-ready code)
- **Feature Branches**: Prefixed with `claude/` for AI-assisted development
  - Example: `claude/claude-md-docs-fjkp3d`

### Git Workflow
1. **Pull latest main**:
   ```bash
   git fetch origin main
   git pull origin main
   ```

2. **Make changes** to files (particularly index.html or sw.js)

3. **Commit with descriptive messages**:
   ```bash
   git commit -m "Brief description of changes"
   ```

4. **Push to feature branch**:
   ```bash
   git push -u origin claude/claude-md-docs-fjkp3d
   ```

5. **Create Pull Request** when ready (optional, for code review)

### Deployment
- Changes committed to `main` are automatically deployed to Firebase Hosting
- Service worker cache version should be updated for major changes
- APK builds should be regenerated for Android releases

---

## Architecture Patterns

### State Management
The application uses **localStorage** and **in-memory data structures** for state:
- **Dishes**: Catalog of available items
- **Orders**: Customer orders with timestamps
- **Debts**: Financial records and payment tracking
- **Settings**: User preferences and configuration

### Map Integration
A Leaflet-compatible adapter (`L` object) wraps Yandex Maps API:
- Standardizes common map operations (setView, addLayer, removeLayer, etc.)
- Supports both GeoJSON and coordinate-based markers
- Handles click events and tooltip management
- Gracefully waits for Yandex Maps API to load asynchronously

**Key Map Functions**:
- `new L.Map(element, options)` - Initialize map
- `L.marker(coordinates, options)` - Add marker
- `.setView(center, zoom)` - Pan/zoom to location
- `.on('click', callback)` - Handle clicks
- `.invalidateSize()` - Recalculate on resize

### Caching Strategy
- **Network-First** (App Shell): Always try to fetch latest, fall back to cache when offline
- **Cache-First** (CDN): Serve from cache if available, fetch if not (for fonts, libraries)
- **No Cache** (External APIs): Yandex Maps, Railway API always fetch fresh

---

## Key Conventions

### Code Style
- **Vanilla JavaScript**: No framework or build tools
- **Inline Assets**: HTML, CSS, and JS are all in one file for single-file deployment
- **ES6+ Support**: Use modern JavaScript (arrow functions, const/let, template literals)
- **Comments**: Primarily in Uzbek or English; explain WHY not WHAT

### Naming Conventions
- **CSS Classes**: kebab-case (e.g., `.dish-item`, `.map-container`)
- **JavaScript Variables**: camelCase (e.g., `currentUser`, `selectedDish`)
- **Functions**: camelCase verbs (e.g., `fetchDishes()`, `addOrder()`)
- **Constants**: UPPER_SNAKE_CASE for globals (e.g., `DEFAULT_PIN`, `CACHE`)

### HTML Structure
- Semantic HTML5 (`<header>`, `<nav>`, `<main>`, `<footer>`, etc.)
- Data attributes for JS targeting: `data-dish-id`, `data-order-id`
- ARIA labels for accessibility where applicable
- Mobile-first responsive design (min-width media queries)

### CSS Standards
- **Mobile-First**: Base styles for mobile, enhance with media queries
- **Responsive Breakpoints**: Adapt to tablet and desktop screens
- **Color Scheme**: 
  - Background: `#F5F1EA`
  - Primary: `#EA5A1F` (orange)
  - Respect system dark mode preferences if implemented
- **Fonts**: Plus Jakarta Sans (headings, bold), Inter (body, regular)

### Performance Considerations
- **Monolithic HTML**: Single 1MB file loads entire app
- **Service Worker Cache**: Cold start uses cache; subsequent visits fetch fresh
- **Lazy Loading**: Images and maps should load on demand
- **API Calls**: Batch requests to Yandex Maps and external services
- **LocalStorage**: Keep data serialization efficient; avoid large objects

### Security Principles
- **Content Security Policy**: Be mindful of inline scripts and styles
- **XSS Prevention**: Sanitize user input when rendering dishes/orders
- **CORS Handling**: External APIs (Yandex Maps, Railway) must allow cross-origin requests
- **No Secrets**: Ensure API keys are for public use (AdSense, Maps)

---

## Common Tasks

### Adding a New Feature
1. Identify the feature scope (UI, data model, or integration)
2. Add HTML markup to index.html
3. Add CSS styles in the `<style>` tag
4. Add JavaScript logic in the `<script>` tag
5. Update Service Worker cache version if adding new assets
6. Test offline functionality with DevTools > Application > Service Workers
7. Commit with descriptive message

### Updating the Dish Catalog
- Catalog likely stored in localStorage or embedded in index.html
- Update or fetch from external API (check for Railway API integration)
- Rebuild UI with fresh data
- Clear cache if adding new assets

### Fixing Bugs
1. Reproduce in DevTools Console or Network tab
2. Check Service Worker cache for stale content
3. Verify Yandex Maps API responses (check Network tab)
4. Update code in index.html
5. Increment Service Worker cache version
6. Test with empty cache (DevTools > Application > Clear storage)

### Deploying Updates
1. Commit changes to feature branch
2. Push to GitHub: `git push -u origin <branch-name>`
3. Merge to main via pull request or direct commit
4. Firebase automatically deploys within minutes
5. Test at https://unutilmastam.web.app or custom domain

---

## External APIs & Services

### Yandex Maps
- **Endpoint**: `https://api-maps.yandex.ru/2.1/`
- **API Key**: `6f9911e6-17d0-4de5-a252-8771f99dcc03` (embedded in index.html)
- **Usage**: Map display, geocoding, marker placement
- **Rate Limits**: Check Yandex Maps documentation
- **Fallback**: Gracefully degrade if maps unavailable

### Railway API (Inferred)
- **Purpose**: Likely for order processing or data storage
- **Note**: Endpoint not embedded in provided code; check server configuration
- **Caching**: Bypasses Service Worker cache (always fresh)

### Google AdSense
- **Client ID**: `ca-pub-5038263107741699`
- **Script**: Loaded asynchronously at page load
- **Purpose**: Revenue generation via ads
- **Considerations**: Users may have ad blockers

### Firebase Hosting
- **Project**: unutilmastam
- **Region**: Auto-assigned by Firebase
- **Domain**: https://unutilmastam.web.app
- **Custom Domain**: Use CNAME file (currently set up)

---

## Testing & Validation

### Manual Testing Checklist
- [ ] Load app in Chrome DevTools (desktop & mobile sizes)
- [ ] Verify map loads and responds to clicks
- [ ] Test offline mode: DevTools > Application > Service Workers > offline
- [ ] Check form submissions (orders, debt entries)
- [ ] Validate responsive design on tablet and mobile
- [ ] Test geolocation permissions (if used)
- [ ] Verify localStorage persistence across sessions

### Browser Compatibility
- **Primary**: Chrome/Edge (latest 2 versions)
- **Secondary**: Firefox, Safari, Mobile browsers
- **Target**: iOS Safari 12+, Android Chrome 60+
- **PWA**: Install on home screen and test as standalone app

### Performance Testing
- **Lighthouse Audit**: Run in DevTools to check PWA score
- **Network Tab**: Monitor resource loading and API calls
- **Coverage**: Check for unused CSS/JS
- **Cache**: Verify Service Worker caching in DevTools

---

## Common Issues & Solutions

### Service Worker Cache Issues
**Problem**: Old content showing after update
**Solution**: 
1. Increment `CACHE` version in sw.js (e.g., `unutilmas-v43` → `unutilmas-v44`)
2. Update app shell files list if changed
3. Deploy and hard-refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

### Maps Not Loading
**Problem**: Yandex Maps API not responding
**Solution**:
1. Check API key validity in index.html
2. Verify network connectivity in DevTools Network tab
3. Check Yandex Maps service status
4. Provide fallback message in UI

### Offline Functionality Not Working
**Problem**: App doesn't work offline
**Solution**:
1. Check Service Worker registration: DevTools > Application > Service Workers
2. Ensure index.html is in APP_SHELL list in sw.js
3. Verify fetch strategy: network-first should cache fallback
4. Test with DevTools > Application > Network set to "Offline"

### Firebase Deployment Slow
**Problem**: Changes take time to appear
**Solution**:
1. Wait 2-5 minutes for Firebase CDN propagation
2. Clear browser cache and hard-refresh
3. Check build logs: `firebase deploy --debug`
4. Verify firebase.json configuration

---

## Git Commit Message Guidelines

### Format
```
<type>: <subject>

<body (optional)>
```

### Types
- **feat**: New feature (dish type, order tracking, etc.)
- **fix**: Bug fix (offline mode, map rendering, etc.)
- **refactor**: Code restructuring (no behavior change)
- **perf**: Performance improvement
- **style**: Formatting, CSS updates
- **docs**: Documentation updates
- **chore**: Build system, dependencies, cache updates

### Examples
```
feat: add debt tracking system to order page

fix: service worker cache version mismatch

style: update color scheme for accessibility

chore: increment service worker cache to v44
```

---

## Future Considerations

### Potential Improvements
1. **Framework Migration**: Consider Vue/React for better scalability
2. **Data Persistence**: Implement backend database (Firebase Firestore, PostgreSQL)
3. **Real-time Updates**: Add WebSocket support for live order tracking
4. **Multi-language**: Full localization beyond Uzbek
5. **Dark Mode**: Implement system preference detection
6. **Analytics**: Track user behavior and popular dishes
7. **Payment Integration**: Connect to payment systems
8. **PWA Updates**: Implement service worker update notifications

### Known Limitations
- Single monolithic HTML file (hard to maintain at scale)
- No build process (limits optimization)
- Vanilla JS only (no dependency management)
- Inline styles make theming difficult
- No version control for database/content

---

## Resources & Documentation

### External Links
- [Yandex Maps Documentation](https://yandex.com/dev/maps/)
- [Firebase Hosting Guide](https://firebase.google.com/docs/hosting)
- [Web App Manifests (MDN)](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Workers (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

### Local Development
No build tools required. Simply:
1. Edit index.html directly in your editor
2. Open in browser to test
3. Use DevTools for debugging
4. Commit and push changes

### Contributing
- All changes should maintain backward compatibility
- Test offline functionality for every update
- Update CLAUDE.md if architecture changes
- Keep CSS organized and responsive
- Document complex JavaScript logic

---

**Last Updated**: 2026-08-03
**Cache Version**: v43
**Language**: Uzbek (uz)
**Maintained By**: Claude Code
