import { Actor } from "apify";
import { PuppeteerCrawler, KeyValueStore, Dictionary } from "crawlee";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import replPlugin from "puppeteer-extra-plugin-repl";
import addblockerPlugin from "puppeteer-extra-plugin-adblocker";
import { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from "puppeteer";

export interface IScreenshot {
  encoding: string;
  type: string;
  img: string;
}
export interface IHDPrice {
  url?: string | { [key: string]: string };
  name?: string;
  price: number | string;
  screenshot?: IScreenshot;
}

const NAME_SCRAPE_ERROR = "NAME_SCRAPE_ERROR";

const scrapeProductName = async (page, log) => {
  try {
    const productName = await page.$eval(
      ".product-details h1",
      (title) => title.textContent,
    );

    log.info(`Scraped product name: ${productName}`);

    return productName;
  } catch (e) {
    const err = e as Error;
    log.error(`failed scraping product name due to ${err.name}`, {
      error: { name: err.name, message: err.message },
    });
  }
};

await Actor.main(async () => {
  // const startUrls = [
  //   "https://www.homedepot.com/p/Husky-56-in-W-x-22-in-D-Heavy-Duty-23-Drawer-Combination-Rolling-Tool-Chest-and-Top-Tool-Cabinet-Set-in-Matte-Black-HOTC5623BB2S/303412321",
  // ];
  const input = (await KeyValueStore.getInput()) as Dictionary;

  const { startUrl } = input;

  // Prepare puppeteer plugins
  puppeteerExtra.use(stealthPlugin());
  puppeteerExtra.use(replPlugin());
  puppeteerExtra.use(
    addblockerPlugin({
      // Optionally enable Cooperative Mode for several request interceptors
      interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    }),
  );

  // env vars used
  const {
    MAX_REQUEST_RETRIES,
    MAX_REQUESTS_PER_CRAWL,
    NAVIGATION_TIMEOUT_SECS,
    REQUEST_HANDLER_TIMEOUT_SECS,
    USE_SESSION_POOL,
    MAX_POOL_SIZE,
    PERSIST_COOKIES_PER_SESSION,
    MAX_CONCURRENCY,
  } = process.env;

  // Create a PuppeteerCrawler
  const crawler = new PuppeteerCrawler({
    // proxyConfiguration,
    // requestHandler: router,
    launchContext: {
      launcher: puppeteerExtra,
      launchOptions: {
        headless: true,
        defaultViewport: { width: 1280, height: 720 },
      },
    },
    maxRequestRetries:
      (MAX_REQUEST_RETRIES && Number.parseInt(MAX_REQUEST_RETRIES)) || 0,
    maxRequestsPerCrawl:
      (MAX_REQUESTS_PER_CRAWL && Number.parseInt(MAX_REQUESTS_PER_CRAWL)) || 1,
    navigationTimeoutSecs:
      (NAVIGATION_TIMEOUT_SECS && Number.parseInt(NAVIGATION_TIMEOUT_SECS)) ||
      60,
    requestHandlerTimeoutSecs:
      (REQUEST_HANDLER_TIMEOUT_SECS &&
        Number.parseInt(REQUEST_HANDLER_TIMEOUT_SECS)) ||
      60,
    // Activates the Session pool (default is true).
    useSessionPool: USE_SESSION_POOL?.toLowerCase() === "false" ? false : true,
    // Overrides default Session pool configuration
    sessionPoolOptions: {
      maxPoolSize: (MAX_POOL_SIZE && Number.parseInt(MAX_POOL_SIZE)) || 10,
    },
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookies to page before navigation automatically (default is true).
    persistCookiesPerSession:
      PERSIST_COOKIES_PER_SESSION?.toLowerCase() === "false" ? false : true,
    autoscaledPoolOptions: {
      maxConcurrency:
        (MAX_CONCURRENCY && Number.parseInt(MAX_CONCURRENCY)) || 1,
    },

    async requestHandler(ctx) {
      const { request, page, log, session, pushData } = ctx;

      const title = await page.title();
      const url = request.loadedUrl;

      log.info(`crawling ${url} for price`, { title, url });
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

      // This is the div that houses the multiple 'span' components that make
      // up the price
      const priceComponent = await page.waitForSelector(priceContainer);
      if (priceComponent) {
        const hdPrice: IHDPrice = await priceComponent.$$eval(
          "span",
          async (els) => {
            const data: string[] = [];
            for (const span of els) {
              const price = span.textContent;
              if (price) {
                data.push(price);
              }
            }
            // Join together the multiple span components to form the price as
            // a single string
            return { price: data.join("") };
          },
        );

        if (hdPrice) {
          log.info("scraped price", { price: hdPrice.price });

          // Scrape product name
          let productName = await scrapeProductName(page, log);

          if (!productName) {
            // if using product name in url
            // const re = /\w+:\/\/\w*\.?homedepot\.com\/p\/([^/]*)\/?.*/;
            // product name from page title
            const re = RegExp("(?<product>.+)");
            const match = title.match(re);

            log.debug("regex fallback on page title", {
              startUrl,
              title,
              regexMatch: match,
            });
            log.debug("regex match result", { regexMatch: match });

            if (match) {
              log.debug("regex match 1st capture group result", {
                captureGroup: match[1],
              });

              productName = match[1].replace(" - The Home Depot", "");
              log.debug("final product name result", { productName });
            }

            if (productName) {
              log.info(
                `fall back to product name from page title: ${productName}`,
                { title, productName },
              );
            } else {
              log.error(
                "failed to fall back to product name from page title, setting name to NAME_SCRAPE_ERROR",
                ctx,
              );
            }
          }

          hdPrice.name = productName ?? NAME_SCRAPE_ERROR;
          hdPrice.url = startUrl;

          log.info("scraped data", hdPrice);
        } else {
          log.error(
            "failed to scrape price, skipping product name",
            priceComponent,
          );
        }

        // Take a screenshot for reference
        const screenshotEncoding = "base64";
        const type = "png";

        const screenshot = await page.screenshot({
          encoding: screenshotEncoding,
          type,
          optimizeForSpeed: true,
          clip: {x: 0, y: 180, width: 1280, height: 720 - 180, scale: .25}
        });

        hdPrice.screenshot = {
          encoding: screenshotEncoding,
          type,
          img: screenshot,
        };

        await pushData(hdPrice);
      } else {
        log.error("selector not found", { selector: priceContainer, url });
      }
    },
  });

  // Run the crawler with the start URLs and wait for it to finish.
  await crawler.run(Array.of(startUrl));
});
