import { Actor } from "apify";
import Sitemapper from "sitemapper";

export const initializeRequestQueue = async () => {
  const sites = await fetchSitemapUrls();
  if (sites.length < 1) {
    throw new Error(`No sites found on sitemap file`);
  }

  // Avoid unwanted pages
  const productSites = sites.filter(
    (site) =>
      !site.includes(`/saving-tips/`) &&
      !site.includes(`.au/about-us`) &&
      !site.includes(`.au/afterpay-day`)
  );

  // Limit the number of URLs that get added to queue - FOR TESTING PURPOSES ONLY
  //let limitedProductSites = productSites.slice(0, 20);

  let requestQueue = await Actor.openRequestQueue();
  for (const url of productSites) {
    await requestQueue.addRequest({
      url,
      userData: {
        label: "LISTING",
      },
    });
  }

  if (await requestQueue.isEmpty()) {
    throw new Error(`Request queue cannot be empty`);
  }

  return Promise.resolve(requestQueue);
};

export const proxyConfiguration = async ({ proxyConfig, required = false }) => {
  const configuration = await Actor.createProxyConfiguration(proxyConfig);

  // this works for custom proxyUrls
  if (Actor.isAtHome() && required) {
    if (
      !configuration ||
      (!configuration.usesApifyProxy &&
        (!configuration.proxyUrls || !configuration.proxyUrls.length)) ||
      !configuration.newUrl()
    ) {
      throw new Error(
        "\n=======\nYou must use Apify proxy or custom proxy URLs\n\n======="
      );
    }
  }

  return configuration;
};

async function fetchSitemapUrls() {
  try {
    const sitemap = new Sitemapper();
    const result = await sitemap.fetch(
      `https://coupons.nine.com.au/sitemap.xml`
    );
    return Promise.resolve(result.sites);
  } catch (error) {
    throw new Error(error);
  }
}
