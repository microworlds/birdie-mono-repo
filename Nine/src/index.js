import "dotenv/config";
import { Actor } from "apify";
import { CheerioCrawler, log } from "crawlee";
import { initializeRequestQueue, proxyConfiguration } from "./helpers.js";

(async () => {
  await Actor.init();
  const input = await Actor.getInput();

  let requestQueue = await initializeRequestQueue();

  const proxyConfig = await proxyConfiguration({
    proxyConfig: input.proxyConfig,
  });

  let { maxConcurrency, maxRequestRetries } = input;

  const crawler = new CheerioCrawler({
    requestQueue,
    maxConcurrency,
    maxRequestRetries,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30,
    proxyConfiguration: proxyConfig,
    async requestHandler({ request, response, session, $, body }) {
      if (response.statusCode !== 200) {
        throw new Error(`Unable to load page - ${request.url}`);
      }

      if (request.userData.label === "LISTING") {
        log.info(`Processing sub-domain: ${request.url}`);
        let voucherIds = [];

        // Extract all voucher ids - only unexpired vouchers
        $(`[data-testid="active-vouchers-main-1"] [data-id*="au_"]`).each(
          (index, el) => {
            const dataId = $(el).attr("data-id");
            const isVerified = $(el).next()?.text()?.includes(`Verified`);
            voucherIds.push({
              dataId,
              isVerified,
            });
          }
        );

        // If `voucherIds` length is less than 1, that means we're on the wrong page. Simply log the URL and exit handler
        // @todo: weed out such URLs as they occur - to save recources
        if (voucherIds.length < 1) {
          log.error(`Invalid sub-domain: ${request.url}`);
          session.markGood();
          return;
        }

        // Enqueue single voucher links
        for (const item of voucherIds) {
          await requestQueue.addRequest({
            url: `https://coupons.nine.com.au/api/voucher/country/au/client/d444dfa11de1bada6f593d575bb4e211/id/${item.dataId}`,
            userData: {
              label: "VOUCHER",
              is_verified: item.isVerified,
              coupon_page_url: request.url,
            },
          });
        }
      }

      if (request.userData.label === "VOUCHER") {
        const json = JSON.parse(body.toString());
        json.is_verified = request.userData.is_verified;
        json.coupon_page_url = request.userData.coupon_page_url;
        if (json?.code && !json?.code?.includes(` `)) {
          await Actor.pushData({
            title: json?.title || null,
            code: json?.code || null,
            coupon_page_url: json.coupon_page_url, // coupon listing page
            expiration_date: json?.end_time || null,
            code_id: json?.id_pool || null,
            merchant_name: json?.retailer?.name || null,
            merchant_url: json?.retailer?.merchant_url || null,
            merchant_logo: `https://coupons.nine.com.au/images/224x${json?.retailer?.logo}`,
            is_verified: json.is_verified,
            terms_and_conditions: json.captions.map((caption) => caption?.text),
          });
        }
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
