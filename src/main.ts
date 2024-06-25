import { Actor } from "apify";
import { PuppeteerCrawler, KeyValueStore, Dictionary } from "crawlee";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import replPlugin from "puppeteer-extra-plugin-repl";
import addblockerPlugin from "puppeteer-extra-plugin-adblocker";
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from "puppeteer";

(async () => {
  await Actor.main(async () => {
    // const startUrls = [
    //   "https://www.homedepot.com/p/Husky-56-in-W-x-22-in-D-Heavy-Duty-23-Drawer-Combination-Rolling-Tool-Chest-and-Top-Tool-Cabinet-Set-in-Matte-Black-HOTC5623BB2S/303412321",
    // ];
    const input = (await KeyValueStore.getInput()) as Dictionary;

    const { startUrls } = input;

    // Prepare puppeteer plugins
    puppeteerExtra.use(stealthPlugin());
    puppeteerExtra.use(replPlugin());
    puppeteerExtra.use(
      addblockerPlugin({
        // Optionally enable Cooperative Mode for several request interceptors
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
      }),
    );
    // Create a PuppeteerCrawler
    const crawler = new PuppeteerCrawler({
      // proxyConfiguration,
      // requestHandler: router,
      launchContext: {
        launcher: puppeteerExtra,
        launchOptions: {
          headless: true,
        },
      },
      maxRequestRetries: Number(process.env.MAX_REQUEST_RETRIES) ?? 0,
      maxRequestsPerCrawl: Number(process.env.MAX_REQUESTS_PER_CRAWL) ?? 1,
      navigationTimeoutSecs: Number(process.env.NAVIGATION_TIMEOUT_SECS) ?? 60,
      requestHandlerTimeoutSecs:
        Number(process.env.REQUEST_HANDLER_TIMEOUT_SECS) ?? 60,
      // Activates the Session pool (default is true).
      useSessionPool:
        process.env.USE_SESSION_POOL?.toLowerCase() === "false" ? false : true,
      // Overrides default Session pool configuration
      sessionPoolOptions: {
        maxPoolSize: Number(process.env.MAX_POOL_SIZE) ?? 10,
      },
      // Set to true if you want the crawler to save cookies per session,
      // and set the cookies to page before navigation automatically (default is true).
      persistCookiesPerSession:
        process.env.PERSIST_COOKIES_PER_SESSION?.toLowerCase() === "false"
          ? false
          : true,
      autoscaledPoolOptions: {
        maxConcurrency: Number(process.env.MAX_CONCURRENCY) ?? 1,
      },

      async requestHandler(ctx) {
        const { request, page, log, session, pushData } = ctx;
        page.setDefaultTimeout(60000);

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

        await page.waitForSelector(priceContainer, { timeout: 60000 });

        // Start an interactive REPL here with the `page` instance.
        // await page.repl();
        // // Afterwards start REPL with the `browser` instance.
        // const browser = page.browser();
        // await browser.repl();

        const priceComponent = await page.$(priceContainer);

        if (priceComponent) {
          const hdPrice: { [key: string]: string } =
            await priceComponent.$$eval(
              "span",
              async (els) => {
                const data: string[] = [];
                for (const span of els) {
                  const price = span.textContent;
                  if (price) {
                    data.push(price);
                  }
                }
                return { price: data.join("") };
              },
              log,
            );

          if (hdPrice) {
            let productName;
            try {
              const titleDiv = await page.waitForSelector(
                ".product-details__badge-title--wrapper",
                { timeout: 60000 },
              );

              if (titleDiv) {
                productName = await titleDiv.$eval(
                  "span > h1",
                  (title) => title.textContent,
                );
              }
            } catch (e) {
              const err = e as Error;
              log.error("failed scraping product name", {
                error: { name: err.name, message: err.message },
              });
            }

            hdPrice.name = productName ?? "NAME_SCRAPE_ERROR";
            hdPrice.url = startUrls[0].url;

            log.info("scraped data", hdPrice);
          } else {
            log.error("data not found", priceComponent);
          }
          const screenshot = await page.screenshot({
            encoding: "base64",
            type: "png",
            optimizeForSpeed: true,
          });

          hdPrice.screenshot = screenshot;

          await pushData(hdPrice);
        } else {
          log.error("selector not found", { selector: priceContainer });
          log.error("selector not found", { component: priceComponent });
        }
      },
    });

    // Run the crawler with the start URLs and wait for it to finish.
    await crawler.run(startUrls);
  });
})();
