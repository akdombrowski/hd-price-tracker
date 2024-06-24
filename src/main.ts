import { Actor } from "apify";
import { PuppeteerCrawler, KeyValueStore, Dictionary } from "crawlee";

(async () => {
  await Actor.main(async () => {
    const startUrls = [
      "https://www.homedepot.com/p/Husky-56-in-W-x-22-in-D-Heavy-Duty-23-Drawer-Combination-Rolling-Tool-Chest-and-Top-Tool-Cabinet-Set-in-Matte-Black-HOTC5623BB2S/303412321",
    ];
    const input = (await KeyValueStore.getInput()) as Dictionary;

    const { url } = input;

    // Create a PuppeteerCrawler that will use the proxy configuration and and handle requests with the router from routes.js file.
    const crawler = new PuppeteerCrawler({
      // proxyConfiguration,
      // requestHandler: router,
      launchContext: {
        launchOptions: {
          headless: true,
          timeout: 5000, // ms
        },
      },
      maxRequestRetries: Number(process.env.MAX_REQUEST_RETRIES) ?? 0,
      maxRequestsPerCrawl: Number(process.env.MAX_REQUESTS_PER_CRAWL) ?? 1,
      navigationTimeoutSecs: Number(process.env.NAVIGATION_TIMEOUT_SECS) ?? 25,
      requestHandlerTimeoutSecs:
        Number(process.env.REQUEST_HANDLER_TIMEOUT_SECS) ?? 30,
      // Activates the Session pool (default is true).
      useSessionPool:
        process.env.USE_SESSION_POOL?.toLowerCase() === "false" ? false : true,
      // Overrides default Session pool configuration
      sessionPoolOptions: {
        maxPoolSize: Number(process.env.MAX_POOL_SIZE) ?? 100,
      },
      // Set to true if you want the crawler to save cookies per session,
      // and set the cookies to page before navigation automatically (default is true).
      persistCookiesPerSession:
        process.env.PERSIST_COOKIES_PER_SESSION?.toLowerCase() === "false"
          ? false
          : true,
      autoscaledPoolOptions: { maxConcurrency: 1 },

      async requestHandler(ctx) {
        const { request, page, log, session, pushData } = ctx;
        const title = await page.title();
        const url = request.loadedUrl;

        log.info("crawling", { title, url });
        if (session) {
          if (title === "Blocked") {
            session.retire();
          } else if (
            title === "Not sure if blocked, might also be a connection error"
          ) {
            session.markBad();
          }
          // this step is done automatically in PuppeteerCrawler.
          // else { session.markGood() }
        }

        const priceContainer = "#standard-price > div > div";

        await page.waitForSelector(priceContainer);

        const priceComponent = await page.$(priceContainer);

        if (priceComponent) {
          const tableData = await priceComponent.$$eval(
            "span",
            async (els) => {
              const data: { [key: string]: any } = {};
              for (const tr of els) {
                const children = tr.children;
                const rowData: string[] = [];
                const price = children.item(0)?.textContent;
                if (price) {
                  data[price] = rowData;

                  for (const c of children) {
                    const content = c.textContent;
                    if (content) {
                      rowData.push(c.textContent!!);
                    }
                  }
                }
              }
              return data;
            },
            log,
          );

          log.info("scraped data", tableData);

          await pushData(tableData);
        } else {
          log.error("selector not found", { selector: priceContainer });
        }
      },
    });

    // Run the crawler with the start URLs and wait for it to finish.
    await crawler.run(url);
  });
})();
