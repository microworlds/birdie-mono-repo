import { Actor } from "apify";
import { parseHTML } from "linkedom";
import * as chrono from "chrono-node";
import { HttpCrawler, log, sleep } from "crawlee";
import { initializeRequestQueue, proxyConfiguration } from "./helpers.js";

(async () => {
  await Actor.init();
  const input = await Actor.getInput();

  let requestQueue = await initializeRequestQueue();

  const proxyConfig = await proxyConfiguration({
    proxyConfig: input.proxyConfig,
  });

  let { maxConcurrency, maxRequestRetries } = input;

  const crawler = new HttpCrawler({
    requestQueue,
    maxConcurrency,
    maxRequestRetries,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30,
    //proxyConfiguration: proxyConfig,
    async requestHandler({ request, response, session, body }) {
      if (response.statusCode !== 200) {
        throw new Error(`Unable to load page - ${request.url}`);
      }

      // Initialize DOM
      const { document } = parseHTML(body.toString());

      // Handle brand category page
      if (request.userData.label === "LISTING") {
        log.info(`Processing category: ${request.url}`);

        const companyUrls = [
          ...document.querySelectorAll(
            `ul.grid.gap-3 li a[class="hover:underline"]`
          ),
        ]
          .map(
            (a) =>
              `https://www.australiancoupons.com.au${a?.getAttribute("href")}`
          )
          .slice(0, 2);

        // Enqueue single voucher links
        for (const url of companyUrls) {
          await requestQueue.addRequest({
            url,
            userData: {
              label: "VOUCHER_LISTING",
              coupon_page_url: request.url,
            },
          });
        }
      }

      // Handle brand page
      if (request.userData.label === "VOUCHER_LISTING") {
        const brand_name = document
          .querySelector(`#root ul.block.c-breadcrumbs li:nth-child(3)`)
          ?.textContent?.trim();

        const voucherInfo = [
          ...document.querySelectorAll(`main .BrandOffers article`),
        ].map((article) => {
          // Extract and parse expiration date if found for a given voucher
          const timeSvg = article?.querySelector(
            `svg[viewBox="0 0 24 24"] path[d*="M12 8v4l3 3m6-3a9"]`
          );
          let expiration_date = `N/A`;
          if (timeSvg) {
            try {
              const text =
                timeSvg?.parentNode?.parentNode?.parentNode?.textContent
                  ?.trim()
                  ?.replace(`Expires `, ``);
              const date = chrono.parseDate(text);
              expiration_date = date.toISOString();
            } catch (error) {
              // ignore
            }
          }
          const url = `https://www.australiancoupons.com.au/go/3/${article.getAttribute(
            "data-id"
          )}`;
          return {
            url,
            expiration_date,
          };
        });

        // Enqueue single voucher links
        for (const voucher of voucherInfo) {
          await requestQueue.addRequest({
            url: voucher?.url,
            userData: {
              label: "VOUCHER",
              coupon_page_url: request.url,
              brand_name,
              expiration_date: voucher?.expiration_date,
            },
          });
        }
      }

      // Handle single voucher page
      if (request.userData.label === "VOUCHER") {
        const title =
          document.querySelector(`h3.font-title`)?.textContent?.trim() || null;
        const code =
          document.querySelector(`#CodeCoupon`)?.textContent?.trim() || null;
        const coupon_code_required = document
          .querySelector(`body`)
          ?.textContent?.includes(`No code is required at checkout`)
          ? false
          : true;
        const coupon_page_url = request?.userData?.coupon_page_url;
        const merchant_url = request.url?.replace(`/go/3/`, `/go/2/`); // This will cause re-directs
        const merchant_logo = document
          .querySelector(`img[src*="/logo"]`)
          ?.getAttribute(`src`);
        const is_verified = title?.includes(`erified`);
        const terms_and_conditions =
          document
            .querySelector(`.bg-gray-100.p-6 .text-sm p`)
            ?.textContent?.split(`* `)
            ?.slice(1)
            ?.filter((item) => !item?.includes(`For full Terms`)) || [];

        await Actor.pushData({
          title,
          brand_name: request.userData?.brand_name,
          code,
          coupon_code_required,
          coupon_page_url,
          expiration_date: request?.userData?.expiration_date,
          merchant_name: request?.userData?.merchant_name,
          merchant_url,
          merchant_logo,
          is_verified,
          terms_and_conditions,
        });
      }

      session.markGood();
    },
    useSessionPool: true,
    sessionPoolOptions: {
      sessionOptions: {
        maxUsageCount: 200,
        maxErrorScore: 1,
      },
    },
    persistCookiesPerSession: true,
    async failedRequestHandler({ request, log }) {
      log.error(
        `${request.url} failed ${request.retryCount} times and won't be retried anymore...`
      );
      await Actor.pushData({
        "#error": true,
        "#url": request.url,
      });
    },
  });

  try {
    await crawler.run();
    await crawler.teardown();
  } catch (error) {
    log.error(error);
  } finally {
    await Actor.exit();
  }
})();
