import { Actor } from "apify";

export const initializeRequestQueue = async () => {
  let requestQueue = await Actor.openRequestQueue();

  const suffixes = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
  ];

  // For test purposes only
  for (const suffix of suffixes) {
    await requestQueue.addRequest({
      url: `https://www.australiancoupons.com.au/brands/a`,
      userData: {
        label: "LISTING",
      },
    });
  }

  // for (const suffix of suffixes) {
  //   await requestQueue.addRequest({
  //     url: `https://www.australiancoupons.com.au/brands/${suffix}`,
  //     userData: {
  //       label: "LISTING",
  //     },
  //   });
  // }

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
