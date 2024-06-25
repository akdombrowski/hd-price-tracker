import { Browser, Page } from "puppeteer";

export default async function StartPuppeteerREPL({
  page,
  browser,
}: {
  page: Page;
  browser?: Browser;
}) {
  // Start an interactive REPL here with the `page` instance.
  await page.repl();
  // Afterwards start REPL with the `browser` instance.
  browser ??= page.browser();
  await browser.repl();

  return { page, browser };
}
