import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// In CI: Full multi-device coverage for layout and responsive viewport specs,
// while running all functional suites on core Desktop and Mobile targets.
const layoutResponsiveSpecPattern = /(01-layout-viewport|04-scroll-navigation|08-mobile-profile)\.spec\.mjs/;
const allSpecsPattern = /.*\.spec\.mjs/;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: isCI ? 20000 : 30000,
    expect: {
        timeout: 5000
    },
    fullyParallel: true,
    workers: isCI ? 2 : 2,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
        ['json', { outputFile: 'reports/playwright-report.json' }]
    ],
    use: {
        baseURL: 'http://127.0.0.1:8080',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    webServer: {
        command: 'node ./scripts/serve_public.mjs',
        url: 'http://127.0.0.1:8080',
        reuseExistingServer: true,
        timeout: 10000
    },
    projects: [
        // 1. iPhone SE (320x568) - Portrait
        {
            name: 'iPhone SE - Portrait',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                viewport: { width: 320, height: 568 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
            }
        },
        // 2. iPhone SE (568x320) - Landscape
        {
            name: 'iPhone SE - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                viewport: { width: 568, height: 320 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
            }
        },
        // 3. iPhone 12 (390x844) - Portrait (Core Mobile Target: Runs Full Suite)
        {
            name: 'iPhone 12 - Portrait',
            testMatch: allSpecsPattern,
            use: {
                ...devices['iPhone 12'],
                defaultBrowserType: 'chromium'
            }
        },
        // 4. iPhone 12 (844x390) - Landscape
        {
            name: 'iPhone 12 - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['iPhone 12 landscape'],
                defaultBrowserType: 'chromium'
            }
        },
        // 5. iPhone 14 Pro (393x852) - Portrait
        {
            name: 'iPhone 14 Pro - Portrait',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['iPhone 14 Pro'],
                defaultBrowserType: 'chromium'
            }
        },
        // 6. iPhone 14 Pro (852x393) - Landscape
        {
            name: 'iPhone 14 Pro - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['iPhone 14 Pro landscape'],
                defaultBrowserType: 'chromium'
            }
        },
        // 7. iPhone 15 Pro Max (430x932) - Portrait
        {
            name: 'iPhone 15 Pro Max - Portrait',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['iPhone 15 Pro Max'],
                defaultBrowserType: 'chromium'
            }
        },
        // 8. iPhone 15 Pro Max (932x430) - Landscape
        {
            name: 'iPhone 15 Pro Max - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['iPhone 15 Pro Max landscape'],
                defaultBrowserType: 'chromium'
            }
        },
        // 9. Pixel 7 (412x915) - Portrait
        {
            name: 'Pixel 7 - Portrait',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['Pixel 7']
            }
        },
        // 10. Pixel 7 (915x412) - Landscape
        {
            name: 'Pixel 7 - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['Pixel 7 landscape']
            }
        },
        // 11. Samsung Galaxy S23 (360x780) - Portrait
        {
            name: 'Samsung Galaxy S23 - Portrait',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                viewport: { width: 360, height: 780 },
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
            }
        },
        // 12. Samsung Galaxy S23 (780x360) - Landscape
        {
            name: 'Samsung Galaxy S23 - Landscape',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                viewport: { width: 780, height: 360 },
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true,
                userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
            }
        },
        // 13. Desktop 1366x768
        {
            name: 'Desktop 1366x768',
            testMatch: isCI ? layoutResponsiveSpecPattern : allSpecsPattern,
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1366, height: 768 }
            }
        },
        // 14. Desktop 1920x1080 (Core Full HD Desktop Target: Runs Full Suite)
        {
            name: 'Desktop 1920x1080',
            testMatch: allSpecsPattern,
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1920, height: 1080 }
            }
        }
    ]
});
