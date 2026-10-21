module.exports = {
  ci: {
    collect: {
      startServerCommand: "node ./scripts/serve_public.mjs",
      startServerReadyPattern: "Serving",
      ...(process.platform === 'win32' && !process.env.CHROME_PATH ? {
        chromePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      } : {}),
      url: [
        "http://127.0.0.1:8080/",
        "http://127.0.0.1:8080/?view=mapa",
        "http://127.0.0.1:8080/?view=radar",
        "http://127.0.0.1:8080/?view=clubes",
        "http://127.0.0.1:8080/?view=social",
        "http://127.0.0.1:8080/?view=perfil"
      ],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --headless --disable-gpu"
      }
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { "minScore": 0.90 }],
        "categories:accessibility": ["warn", { "minScore": 0.95 }],
        "categories:best-practices": ["warn", { "minScore": 0.95 }],
        "categories:seo": ["warn", { "minScore": 0.90 }],
        "categories:pwa": ["warn", { "minScore": 0.80 }]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: "reports/lighthouse"
    }
  }
};
