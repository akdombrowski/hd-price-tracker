import {
  Dataset,
  Dictionary,
  LoadedRequest,
  Log,
  createPuppeteerRouter,
  Request,
} from "crawlee";
import { Page } from "puppeteer";

export const router = createPuppeteerRouter();

router.addDefaultHandler(async ({ enqueueLinks, log }) => {
  log.info(`enqueueing of URLs`);
  console.log();
  console.log();
  console.log();
  console.log(`enqueueing of URLs`);
  console.log();

  await enqueueLinks({
    globs: [
      "https://www.navyfederal.org/loans-cards/mortgage/mortgage-rates/conventional-fixed-rate-mortgages.html",
    ],
    label: "detail",
  });
});

const parse = async ({
  request,
  page,
  log,
}: {
  request: LoadedRequest<Request<Dictionary>>;
  page: Page;
  log: Log;
}) => {
  console.log();
  console.log();
  console.log();
  console.log("parse");
  console.log();
  log.info(`crawling ${request}`);
  const title = await page.title();
  const tbody = await page.$("table tbody");
  log.info(`${tbody}`, { tbody: tbody });
  // /html/body/div/main/section/div/div/div/div[2]/div/div/div[4]/div/table/tbody/tr[3]/td[1]

  log.info(`${title}`, { url: request.loadedUrl });

  console.log();
  console.log(`${title}`, { url: request.loadedUrl });
  console.log();

  await Dataset.pushData({
    url: request.loadedUrl,
    title,
  });
};

router.addHandler("detail", async ({ request, page, log }) => {
  console.log();
  console.log();
  console.log();
  console.log("detail");
  console.log();
  await parse({ request, page, log });
});

export default router;