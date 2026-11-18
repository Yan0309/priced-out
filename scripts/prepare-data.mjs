import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));

const countiesRaw = readJson("censusreporter_counties_raw.json");
const statesRaw = readJson("censusreporter_states_raw.json");
const usRaw = readJson("censusreporter_us_raw.json");
const statesTopology = readJson("states-10m.json");

const stateNames = new Map(
  statesTopology.objects.states.geometries.map((geometry) => [
    geometry.id,
    geometry.properties.name,
  ]),
);

const stateAbbreviations = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

const round = (value, places = 4) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

function quantities(record) {
  const rentBurden = record.B25070?.estimate;
  const rentBurdenError = record.B25070?.error;
  if (!rentBurden) return null;

  const total = rentBurden.B25070001 ?? 0;
  const notComputed = rentBurden.B25070011 ?? 0;
  const denominator = total - notComputed;
  if (denominator <= 0) return null;

  const burdenCount =
    (rentBurden.B25070007 ?? 0) +
    (rentBurden.B25070008 ?? 0) +
    (rentBurden.B25070009 ?? 0) +
    (rentBurden.B25070010 ?? 0);
  const severeCount = rentBurden.B25070010 ?? 0;
  const burdenError =
    (rentBurdenError?.B25070007 ?? 0) +
    (rentBurdenError?.B25070008 ?? 0) +
    (rentBurdenError?.B25070009 ?? 0) +
    (rentBurdenError?.B25070010 ?? 0);

  return {
    total,
    notComputed,
    denominator,
    burdenCount,
    severeCount,
    burdenRate: (burdenCount / denominator) * 100,
    severeRate: (severeCount / denominator) * 100,
    approxMoeBurdenRate: (burdenError / denominator) * 100,
  };
}

function stateFields(record) {
  const rentBurden = quantities(record);
  const renterHouseholds = record.B25003?.estimate?.B25003003 ?? null;
  const renterIncome = record.B25119?.estimate?.B25119003 ?? null;
  const medianRent = record.B25064?.estimate?.B25064001 ?? null;
  if (!rentBurden) return null;

  return {
    burdenRate: rentBurden.burdenRate,
    severeRate: rentBurden.severeRate,
    approxMoeBurdenRate: rentBurden.approxMoeBurdenRate,
    rentBurdenDenominator: rentBurden.denominator,
    burdenCount: rentBurden.burdenCount,
    severeCount: rentBurden.severeCount,
    renterHouseholds,
    renterIncome,
    medianRent,
    rentToIncome:
      renterIncome && medianRent ? ((medianRent * 12) / renterIncome) * 100 : null,
  };
}

const national = stateFields(usRaw.data["01000US"]);

const states = [];
for (const [gid, record] of Object.entries(statesRaw.data)) {
  const fips = gid.slice(-2);
  if (!stateNames.has(fips)) continue;
  const fields = stateFields(record);
  if (!fields) continue;
  states.push({
    fips,
    abbr: stateAbbreviations[fips],
    name: stateNames.get(fips),
    ...fields,
  });
}

const counties = [];
for (const [gid, record] of Object.entries(countiesRaw.data)) {
  const fips = gid.slice(-5);
  const stateFips = fips.slice(0, 2);
  if (!stateNames.has(stateFips) || Number(stateFips) > 56) continue;
  const fields = stateFields(record);
  if (!fields) continue;
  const fullName = countiesRaw.geography[gid].name;
  const shortName = fullName.replace(/,\s+[A-Z]{2}$/, "");
  counties.push({
    fips,
    stateFips,
    stateAbbr: stateAbbreviations[stateFips],
    name: fullName,
    shortName,
    population: record.B01003?.estimate?.B01003001 ?? null,
    ...fields,
  });
}

const modelRows = counties.filter(
  (county) =>
    county.renterHouseholds >= 1000 &&
    county.renterIncome > 0 &&
    county.medianRent > 0 &&
    Number.isFinite(county.burdenRate),
);

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) =>
      column === index ? 1 : 0
    ),
    vector[index],
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];

    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) throw new Error("Singular matrix");
    for (let item = column; item < augmented[column].length; item += 1) {
      augmented[column][item] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item < augmented[row].length; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return augmented.map((row) => row[row.length - 1]);
}

function regression(rows, featureExtractor) {
  const x = rows.map(featureExtractor);
  const width = x[0].length;
  const xtx = Array.from({ length: width }, () =>
    Array(width).fill(0)
  );
  const xty = Array(width).fill(0);

  rows.forEach((row, index) => {
    for (let first = 0; first < width; first += 1) {
      xty[first] += x[index][first] * row.burdenRate;
      for (let second = 0; second < width; second += 1) {
        xtx[first][second] += x[index][first] * x[index][second];
      }
    }
  });

  const coefficients = solveLinearSystem(xtx, xty);
  const meanY =
    rows.reduce((sum, row) => sum + row.burdenRate, 0) / rows.length;
  let residualSum = 0;
  let totalSum = 0;

  rows.forEach((row, index) => {
    const fitted = x[index].reduce(
      (sum, value, featureIndex) => sum + value * coefficients[featureIndex],
      0
    );
    residualSum += (row.burdenRate - fitted) ** 2;
    totalSum += (row.burdenRate - meanY) ** 2;
  });

  return {
    n: rows.length,
    coefficients: coefficients.map((value) => round(value, 6)),
    rSquared: round(1 - residualSum / totalSum, 6),
  };
}

const incomeModel = regression(modelRows, (county) => [
  1,
  county.renterIncome / 10000,
]);
const rentModel = regression(modelRows, (county) => [
  1,
  county.medianRent / 100,
]);
const twoVariableModel = regression(modelRows, (county) => [
  1,
  county.renterIncome / 10000,
  county.medianRent / 100,
]);

states.sort((first, second) => second.burdenRate - first.burdenRate);
counties.sort((first, second) => second.burdenRate - first.burdenRate);

const featuredNames = [
  "Osceola County, FL",
  "Ward County, ND",
  "Miami-Dade County, FL",
  "Benton County, AR",
];
const featuredCounties = featuredNames.map((name) =>
  counties.find((county) => county.name === name)
);

const summary = {
  release: {
    id: countiesRaw.release.id,
    name: countiesRaw.release.name,
    years: countiesRaw.release.years,
  },
  generated: new Date().toISOString().slice(0, 10),
  source: {
    name: "U.S. Census Bureau, American Community Survey",
    tables: ["B25070", "B25064", "B25119", "B25003", "B01003"],
    via: "Census Reporter API",
    url: "https://censusreporter.org/",
  },
  national: {
    ...national,
    burdenRate: round(national.burdenRate),
    severeRate: round(national.severeRate),
    rentToIncome: round(national.rentToIncome),
    approxMoeBurdenRate: round(national.approxMoeBurdenRate),
  },
  states: states.map((state) => ({
    ...state,
    burdenRate: round(state.burdenRate),
    severeRate: round(state.severeRate),
    approxMoeBurdenRate: round(state.approxMoeBurdenRate),
    rentToIncome: round(state.rentToIncome),
  })),
  counties: counties.map((county) => ({
    ...county,
    burdenRate: round(county.burdenRate),
    severeRate: round(county.severeRate),
    approxMoeBurdenRate: round(county.approxMoeBurdenRate),
    rentToIncome: round(county.rentToIncome),
  })),
  models: {
    sampleDescription:
      "Counties with at least 1,000 renter households and complete income, rent, and burden estimates.",
    incomeOnly: {
      ...incomeModel,
      slopePer10000: incomeModel.coefficients[1],
    },
    rentOnly: {
      ...rentModel,
      slopePer100: rentModel.coefficients[1],
    },
    incomeAndRent: {
      ...twoVariableModel,
      incomeSlopePer10000: twoVariableModel.coefficients[1],
      rentSlopePer100: twoVariableModel.coefficients[2],
    },
  },
  featuredCounties: featuredCounties.filter(Boolean),
  rankings: {
    highestBurdenCounties: counties
      .filter((county) => county.renterHouseholds >= 10000)
      .slice(0, 8)
      .map((county) => ({
        fips: county.fips,
        name: county.name,
        burdenRate: round(county.burdenRate),
        renterHouseholds: county.renterHouseholds,
      })),
    highestBurdenStates: states.slice(0, 8).map((state) => ({
      fips: state.fips,
      name: state.name,
      abbr: state.abbr,
      burdenRate: round(state.burdenRate),
    })),
    lowestBurdenStates: states.slice(-8).reverse().map((state) => ({
      fips: state.fips,
      name: state.name,
      abbr: state.abbr,
      burdenRate: round(state.burdenRate),
    })),
  },
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const countyColumns = [
  "fips",
  "name",
  "stateAbbr",
  "population",
  "renterHouseholds",
  "rentBurdenDenominator",
  "renterIncome",
  "medianRent",
  "burdenRate",
  "severeRate",
  "rentToIncome",
  "approxMoeBurdenRate",
];
const stateColumns = [
  "fips",
  "name",
  "abbr",
  "renterHouseholds",
  "rentBurdenDenominator",
  "renterIncome",
  "medianRent",
  "burdenRate",
  "severeRate",
  "rentToIncome",
  "approxMoeBurdenRate",
];

const toCsv = (rows, columns) =>
  [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => csvEscape(row[column])).join(",")
    ),
  ].join("\n") + "\n";

fs.writeFileSync(
  path.join(root, "data", "site-data.json"),
  JSON.stringify(summary)
);
fs.writeFileSync(
  path.join(root, "data", "rent_burden_counties.csv"),
  toCsv(counties, countyColumns)
);
fs.writeFileSync(
  path.join(root, "data", "rent_burden_states.csv"),
  toCsv(states, stateColumns)
);

console.log(
  JSON.stringify(
    {
      release: summary.release,
      counties: summary.counties.length,
      states: summary.states.length,
      nationalBurdenRate: summary.national.burdenRate,
      models: summary.models,
      featuredCounties: summary.featuredCounties.map((county) => ({
        name: county.name,
        income: county.renterIncome,
        rent: county.medianRent,
        burdenRate: county.burdenRate,
      })),
    },
    null,
    2
  )
);
