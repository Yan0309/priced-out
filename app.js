const chartElement = document.querySelector("#chart");
const chartCaption = document.querySelector("#chart-caption");
const chartTooltip = document.querySelector("#chart-tooltip");
const vizKicker = document.querySelector("#viz-kicker");
const vizStatus = document.querySelector("#viz-status");
const progressBar = document.querySelector("#reading-progress-bar");
const steps = [...document.querySelectorAll(".step")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const narrative = {
  burden: {
    kicker: "01 / The threshold",
    status: "National estimate",
    caption:
      "ACS 2020–2024. Shares exclude renter households whose rent-to-income ratio was not computed.",
    aria:
      "A grid of 100 renter households shows that about 51 are cost-burdened and about 26 are severely burdened.",
  },
  income: {
    kicker: "02 / The median renter",
    status: "Monthly ratio",
    caption:
      "Annual values divided by 12. Rent is gross rent, including utilities paid by the renter.",
    aria:
      "At median values, monthly rent of 1,413 dollars equals 32 percent of 4,414 dollars in monthly household income.",
  },
  map: {
    kicker: "03 / Geography",
    status: "County estimates",
    caption:
      "Darker counties have a larger share of renter households spending 30% or more of income on rent.",
    aria:
      "A choropleth map of U.S. counties shows higher rent-burden rates concentrated in Florida, coastal areas, and selected mountain and university counties.",
  },
  florida: {
    kicker: "04 / Close-up",
    status: "Florida counties",
    caption:
      "The Florida close-up highlights Osceola County, the highest-burden county with at least 10,000 renter households.",
    aria:
      "A close-up map of Florida shows widespread high rent-burden rates, with Osceola County highlighted.",
  },
  states: {
    kicker: "05 / State by state",
    status: "State estimates",
    caption:
      "Each dot is a state or the District of Columbia. The dashed line marks the national estimate.",
    aria:
      "A dot plot ranks states by rent-burden rate, showing a range from roughly the low forties to more than sixty percent.",
  },
  scatter: {
    kicker: "06 / Income",
    status: "County scatterplot",
    caption:
      "Fitted ordinary least squares line. Point color indicates counties in Florida; point size is held constant for readability.",
    aria:
      "A county scatterplot shows almost no relationship between median renter income and rent-burden rate. The fitted line is nearly flat.",
  },
  pair: {
    kicker: "07 / Same income",
    status: "Two counties",
    caption:
      "Osceola County, FL and Ward County, ND report nearly identical median renter income.",
    aria:
      "A paired comparison shows Osceola County and Ward County have similar renter income, but Osceola has much higher rent and rent burden.",
  },
  model: {
    kicker: "08 / Two variables",
    status: "County regression",
    caption:
      "County-level OLS model. Coefficients describe adjusted associations, not causal effects.",
    aria:
      "A coefficient chart shows higher median rent is associated with more rent burden and higher renter income with less, with an R squared of 0.66.",
  },
};

const stageStatus = [
  [">= 65", "#c4362e"],
  [">= 60", "#e85a45"],
  [">= 55", "#ef9d4f"],
  [">= 50", "#e7c76a"],
  [">= 45", "#77b9a4"],
  [">= 40", "#3b8278"],
  ["No data", "#263632"],
];

const color = d3
  .scaleSequential()
  .domain([30, 66])
  .interpolator(
    d3.interpolateRgbBasis([
      "#dce9e2",
      "#74b9aa",
      "#edc465",
      "#eb7958",
      "#bf332d",
    ])
  );

const formatPercent = (value, digits = 1) =>
  value == null ? "—" : `${value.toFixed(digits)}%`;
const formatInteger = d3.format(",");
const formatCurrency = (value) =>
  value == null ? "—" : `$${d3.format(",")(Math.round(value))}`;
const formatCompactCurrency = (value) =>
  value == null ? "—" : `$${d3.format(".2s")(value).replace("G", "B")}`;
const formatCompact = d3.format(".3s");
const transitionDuration = reducedMotion ? 0 : 520;

let activeStage = null;
let resizeTimer = null;
let siteData;
let countyFeatures;
let stateFeatures;
let countyById;

function drawHeroGrid() {
  const grid = document.querySelector("#hero-house-grid");
  const burdenTiles = Math.round(siteData.national.burdenRate);
  const severeTiles = Math.round(siteData.national.severeRate);

  for (let index = 0; index < 100; index += 1) {
    const tile = document.createElement("span");
    tile.className = "house-tile";
    if (index < burdenTiles) tile.classList.add("is-burdened");
    if (index < severeTiles) tile.classList.add("is-severe");
    tile.style.animationDelay = `${index * 9}ms`;
    grid.append(tile);
  }

  document.querySelector("#hero-burden-number").textContent = Math.round(
    siteData.national.burdenRate
  );
  document.querySelector("#fact-burdened").textContent = `${(
    siteData.national.burdenCount / 1_000_000
  ).toFixed(1)}M`;
  document.querySelector("#fact-rent").textContent = formatCurrency(
    siteData.national.medianRent
  );
  document.querySelector("#fact-income").textContent = formatCurrency(
    siteData.national.renterIncome
  );
}

function chartBounds() {
  return {
    width: chartElement.clientWidth,
    height: chartElement.clientHeight,
  };
}

function clearChart() {
  d3.select(chartElement).selectAll("*").remove();
  hideTooltip();
}

function baseSvg(width, height) {
  return d3
    .select(chartElement)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
}

function drawBurdenStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const svg = baseSvg(width, height);
  const narrow = width < 510;
  const gridWidth = narrow
    ? Math.min(width * 0.86, height * 0.46)
    : width * 0.54;
  const gap = Math.max(3, Math.min(7, gridWidth * 0.018));
  const tile = (gridWidth - gap * 9) / 10;
  const gridHeight = tile * 10 + gap * 9;
  const gridX = narrow ? (width - gridWidth) / 2 : Math.max(12, width * 0.04);
  const gridY = narrow ? 14 : Math.max(22, (height - gridHeight) / 2 - 9);
  const burdenTiles = Math.round(siteData.national.burdenRate);
  const severeTiles = Math.round(siteData.national.severeRate);

  const tiles = svg
    .append("g")
    .selectAll("rect")
    .data(d3.range(100))
    .join("rect")
    .attr("x", (index) => gridX + (index % 10) * (tile + gap))
    .attr("y", (index) => gridY + Math.floor(index / 10) * (tile + gap))
    .attr("width", tile)
    .attr("height", tile)
    .attr("fill", (index) => {
      if (index < severeTiles) return "#8f2824";
      if (index < burdenTiles) return "#ef5b4c";
      return "#2f403c";
    })
    .attr("opacity", 0);

  tiles
    .transition()
    .duration(transitionDuration)
    .delay((index) => (reducedMotion ? 0 : index * 4))
    .attr("opacity", 1);

  const textX = narrow ? width / 2 : gridX + gridWidth + Math.max(30, width * 0.06);
  const textY = narrow ? gridY + gridHeight + 30 : Math.max(54, height * 0.2);
  const textAnchor = narrow ? "middle" : "start";

  svg
    .append("text")
    .attr("class", "chart-number")
    .attr("x", textX)
    .attr("y", textY)
    .attr("text-anchor", textAnchor)
    .text(formatPercent(siteData.national.burdenRate, 1));

  svg
    .append("text")
    .attr("class", "chart-title-small")
    .attr("x", textX)
    .attr("y", textY + (narrow ? 37 : 38))
    .attr("text-anchor", textAnchor)
    .text("cost-burdened");

  svg
    .append("text")
    .attr("class", "chart-label")
    .attr("x", textX)
    .attr("y", textY + 60)
    .attr("text-anchor", textAnchor)
    .text(`≈ ${formatInteger(siteData.national.burdenCount / 1_000_000)}M households`);

  svg
    .append("text")
    .attr("class", "chart-label")
    .attr("x", textX)
    .attr("y", textY + 82)
    .attr("text-anchor", textAnchor)
    .text(`${formatPercent(siteData.national.severeRate, 1)} severely burdened`);

  const legendY = narrow ? height - 18 : height - 24;
  const legendX = gridX;
  const legend = [
    ["Under 30%", "#2f403c"],
    ["30%+", "#ef5b4c"],
    ["50%+", "#8f2824"],
  ];

  if (height >= 285) {
    legend.forEach(([label, fill], index) => {
      const x = legendX + index * (narrow ? 93 : 112);
      svg
        .append("rect")
        .attr("x", x)
        .attr("y", legendY - 9)
        .attr("width", 9)
        .attr("height", 9)
        .attr("fill", fill);
      svg
        .append("text")
        .attr("class", "chart-label")
        .attr("x", x + 15)
        .attr("y", legendY)
        .text(label);
    });
  }
}

function drawIncomeStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const svg = baseSvg(width, height);
  const narrow = width < 520;
  const margin = {
    top: Math.max(38, height * 0.12),
    right: Math.max(18, width * 0.05),
    bottom: 52,
    left: Math.max(24, width * 0.06),
  };
  const innerWidth = width - margin.left - margin.right;
  const availableHeight = height - margin.top - margin.bottom;
  const ratio = siteData.national.rentToIncome;
  const barHeight = Math.max(42, Math.min(94, availableHeight * 0.22));
  const barY = availableHeight * 0.34;
  const x = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);

  const group = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  group
    .append("rect")
    .attr("x", 0)
    .attr("y", barY)
    .attr("width", innerWidth)
    .attr("height", barHeight)
    .attr("fill", "#30413d");

  const rentBar = group
    .append("rect")
    .attr("x", 0)
    .attr("y", barY)
    .attr("width", 0)
    .attr("height", barHeight)
    .attr("fill", "#ef5b4c");

  rentBar
    .transition()
    .duration(transitionDuration)
    .attr("width", x(ratio));

  group
    .append("line")
    .attr("x1", x(30))
    .attr("x2", x(30))
    .attr("y1", barY - 18)
    .attr("y2", barY + barHeight + 16)
    .attr("stroke", "#efb447")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4");

  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", x(30))
    .attr("y", barY - 23)
    .attr("text-anchor", "middle")
    .text("30% benchmark");

  group
    .append("text")
    .attr("x", 13)
    .attr("y", barY + barHeight / 2 + 5)
    .attr("fill", "#fffdf7")
    .attr("font-size", Math.max(13, Math.min(18, width * 0.035)))
    .attr("font-weight", 600)
    .text(`Rent ${formatCurrency(siteData.national.medianRent)}`);

  group
    .append("text")
    .attr("x", Math.max(x(ratio) + 14, x(44)))
    .attr("y", barY + barHeight / 2 + 5)
    .attr("fill", "rgba(255,253,247,0.7)")
    .attr("font-size", 12)
    .text(
      `Income ${formatCurrency(siteData.national.renterIncome)} / year`
    );

  group
    .append("text")
    .attr("x", 0)
    .attr("y", barY - 53)
    .attr("class", "chart-title")
    .text(width < 320 ? "Median month" : "A median month");

  group
    .append("text")
    .attr("x", innerWidth)
    .attr("y", barY - 53)
    .attr("text-anchor", "end")
    .attr("fill", "#ef5b4c")
    .attr("font-family", "Newsreader, Georgia, serif")
    .attr("font-size", Math.max(38, Math.min(64, width * 0.1)))
    .text(`${ratio.toFixed(0)}%`);

  group
    .append("text")
    .attr("x", innerWidth)
    .attr("y", barY - 8)
    .attr("text-anchor", "end")
    .attr("class", "chart-label")
    .text("of income goes to rent");

  const miniY =
    barY + barHeight + Math.max(24, Math.min(56, availableHeight * 0.1));
  const monthlyIncome = siteData.national.renterIncome / 12;
  const columnTwo = narrow ? innerWidth * 0.42 : innerWidth * 0.5;
  const columnThree = narrow ? innerWidth * 0.72 : innerWidth;
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", 0)
    .attr("y", miniY)
    .text(narrow ? "Income" : "Monthly income");
  group
    .append("text")
    .attr("class", "chart-title-small")
    .attr("x", 0)
    .attr("y", miniY + 22)
    .text(formatCurrency(monthlyIncome));

  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", columnTwo)
    .attr("y", miniY)
    .text(narrow ? "Rent" : "Monthly rent");
  group
    .append("text")
    .attr("class", "chart-title-small")
    .attr("x", columnTwo)
    .attr("y", miniY + 22)
    .text(formatCurrency(siteData.national.medianRent));

  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", columnThree)
    .attr("y", miniY)
    .attr("text-anchor", narrow ? "start" : "end")
    .text(narrow ? "Rent / income" : "Rent-to-income");
  group
    .append("text")
    .attr("class", "chart-title-small")
    .attr("x", columnThree)
    .attr("y", miniY + 22)
    .attr("text-anchor", narrow ? "start" : "end")
    .text(formatPercent(ratio, 1));
}

function drawMapStage(focusFlorida = false) {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const svg = baseSvg(width, height);
  const margin = {
    top: width < 520 ? 35 : 38,
    right: width < 520 ? 8 : 16,
    bottom: 43,
    left: width < 520 ? 8 : 16,
  };
  const visibleStateFeatures = stateFeatures.filter(
    (feature) => Number(feature.id) <= 56
  );
  const visibleCountyFeatures = countyFeatures.filter(
    (feature) => Number(String(feature.id).slice(0, 2)) <= 56
  );
  const focusFeatures = visibleCountyFeatures.filter((feature) =>
    String(feature.id).startsWith("12")
  );
  const fitFeatures = focusFlorida ? focusFeatures : visibleStateFeatures;
  const projection = d3
    .geoAlbersUsa()
    .fitExtent(
      [
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ],
      {
        type: "FeatureCollection",
        features: fitFeatures,
      }
    );
  const path = d3.geoPath(projection);
  const drawnFeatures = focusFlorida ? focusFeatures : visibleCountyFeatures;

  svg
    .append("g")
    .selectAll("path")
    .data(drawnFeatures)
    .join("path")
    .attr("class", "map-county is-interactive")
    .attr("d", path)
    .attr("fill", (feature) => {
      const county = countyById.get(String(feature.id));
      return county ? color(county.burdenRate) : "#263632";
    })
    .attr("tabindex", focusFlorida ? 0 : -1)
    .attr("aria-label", (feature) => {
      const county = countyById.get(String(feature.id));
      return county
        ? `${county.name}: ${formatPercent(county.burdenRate)} cost-burdened`
        : "No estimate";
    })
    .on("pointerenter pointermove", (event, feature) => {
      const county = countyById.get(String(feature.id));
      if (county) showCountyTooltip(event, county);
    })
    .on("pointerleave", hideTooltip)
    .on("focus", (event, feature) => {
      const county = countyById.get(String(feature.id));
      if (county) showCountyTooltip(event, county);
    })
    .on("blur", hideTooltip)
    .on("click", (event, feature) => {
      event.stopPropagation();
      const county = countyById.get(String(feature.id));
      if (county) showCountyTooltip(event, county);
    });

  if (!focusFlorida) {
    svg
      .append("g")
      .selectAll("path")
      .data(visibleStateFeatures)
      .join("path")
      .attr("class", "map-state")
      .attr("d", path);
  } else {
    svg
      .append("g")
      .selectAll("path")
      .data(visibleStateFeatures.filter((feature) => feature.id === "12"))
      .join("path")
      .attr("class", "map-state")
      .attr("d", path)
      .attr("stroke-width", 1.2);

    const osceola = countyById.get("12097");
    if (osceola) {
      const feature = drawnFeatures.find((item) => item.id === "12097");
      const [cx, cy] = path.centroid(feature);
      svg
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 7)
        .attr("fill", "#fffdf7")
        .attr("stroke", "#111817")
        .attr("stroke-width", 3);
      svg
        .append("line")
        .attr("class", "annotation-line")
        .attr("x1", cx + 6)
        .attr("y1", cy - 6)
        .attr("x2", Math.min(width - 110, cx + 68))
        .attr("y2", cy - 36);
      svg
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", Math.min(width - 106, cx + 72))
        .attr("y", cy - 40)
        .text("Osceola County");
      svg
        .append("text")
        .attr("class", "chart-label")
        .attr("x", Math.min(width - 106, cx + 72))
        .attr("y", cy - 25)
        .text("65.4% burdened");
    }
  }

  const legendGroup = svg
    .append("g")
    .attr("transform", `translate(${Math.max(12, width * 0.04)},${height - 24})`);
  const legendWidth = Math.min(220, width * 0.56);
  const legendScale = d3.scaleLinear().domain([30, 66]).range([0, legendWidth]);
  const gradientId = focusFlorida ? "florida-gradient" : "map-gradient";
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%");

  d3.range(0, 1.01, 0.1).forEach((stop) => {
    gradient
      .append("stop")
      .attr("offset", `${stop * 100}%`)
      .attr("stop-color", color(30 + stop * 36));
  });

  legendGroup
    .append("rect")
    .attr("width", legendWidth)
    .attr("height", 7)
    .attr("fill", `url(#${gradientId})`);
  legendGroup
    .append("text")
    .attr("class", "legend-tick")
    .attr("x", 0)
    .attr("y", 20)
    .text("30%");
  legendGroup
    .append("text")
    .attr("class", "legend-tick")
    .attr("x", legendWidth / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .text("48%");
  legendGroup
    .append("text")
    .attr("class", "legend-tick")
    .attr("x", legendScale(66))
    .attr("y", 20)
    .attr("text-anchor", "end")
    .text("66%+");

  if (width >= 520) {
    svg
      .append("text")
      .attr("x", width - Math.max(10, width * 0.03))
      .attr("y", height - 8)
      .attr("text-anchor", "end")
      .attr("class", "legend-tick")
      .text("Cost-burdened share of renter households");
  }
}

function drawStatesStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const states = [...siteData.states].sort(
    (first, second) => second.burdenRate - first.burdenRate
  );
  const svg = baseSvg(width, height);
  const narrow = width < 520;
  const margin = {
    top: 30,
    right: narrow ? 18 : 34,
    bottom: 42,
    left: narrow ? 44 : 62,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([35, 66]).range([0, innerWidth]);
  const y = d3
    .scaleBand()
    .domain(states.map((state) => state.abbr))
    .range([0, innerHeight])
    .padding(0.24);
  const labelEvery = Math.max(
    1,
    Math.ceil(11 / (innerHeight / states.length))
  );

  const group = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const ticks = [35, 40, 45, 50, 55, 60, 65];
  group
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(ticks)
        .tickFormat((value) => `${value}%`)
        .tickSize(0)
        .tickPadding(10)
    )
    .call((axis) => axis.select(".domain").remove());

  group
    .selectAll(".state-guide")
    .data(states)
    .join("line")
    .attr("class", "state-guide")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", (state) => y(state.abbr) + y.bandwidth() / 2)
    .attr("y2", (state) => y(state.abbr) + y.bandwidth() / 2);

  const nationalX = x(siteData.national.burdenRate);
  group
    .append("line")
    .attr("class", "state-guide is-national")
    .attr("x1", nationalX)
    .attr("x2", nationalX)
    .attr("y1", -5)
    .attr("y2", innerHeight + 5);
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", nationalX + 5)
    .attr("y", -11)
    .attr("fill", "#efb447")
    .text(`U.S. ${siteData.national.burdenRate.toFixed(1)}%`);

  const dots = group
    .selectAll(".dot-state")
    .data(states)
    .join("circle")
    .attr("class", "dot-state")
    .attr("cx", (state) => x(state.burdenRate))
    .attr("cy", (state) => y(state.abbr) + y.bandwidth() / 2)
    .attr("r", narrow ? 3.6 : 4.5)
    .attr("fill", (state) => color(state.burdenRate))
    .on("pointerenter pointermove", (event, state) =>
      showStateTooltip(event, state)
    )
    .on("pointerleave", hideTooltip);

  dots
    .attr("opacity", 0)
    .transition()
    .duration(transitionDuration)
    .delay((state, index) => (reducedMotion ? 0 : index * 7))
    .attr("opacity", 1);

  group
    .selectAll(".state-label")
    .data(states)
    .join("text")
    .attr("class", "chart-label")
    .attr("x", -10)
    .attr("y", (state) => y(state.abbr) + y.bandwidth() / 2 + 3)
    .attr("text-anchor", "end")
    .style("font-size", narrow ? "8px" : "9px")
    .attr("opacity", (state, index) =>
      !(
        (index % labelEvery === 0 && index < states.length - 4) ||
        index === states.length - 1
      )
        ? 0
        : 1
    )
    .text((state) => state.abbr);

  if (!narrow) {
    const top = states[0];
    const bottom = states[states.length - 1];
    group
      .append("text")
      .attr("class", "chart-title-small")
      .attr("x", x(top.burdenRate) + 12)
      .attr("y", y(top.abbr) + 4)
      .text(`${top.abbr} ${formatPercent(top.burdenRate)}`);
    group
      .append("text")
      .attr("class", "chart-label")
      .attr("x", x(bottom.burdenRate) + 12)
      .attr("y", y(bottom.abbr) + 4)
      .text(`${bottom.abbr} ${formatPercent(bottom.burdenRate)}`);
  }
}

function drawScatterStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const rows = siteData.counties.filter(
    (county) =>
      county.renterHouseholds >= 1000 &&
      county.renterIncome > 0 &&
      county.medianRent > 0
  );
  const svg = baseSvg(width, height);
  const narrow = width < 520;
  const margin = {
    top: 42,
    right: narrow ? 16 : 30,
    bottom: narrow ? 54 : 62,
    left: narrow ? 58 : 64,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (county) => county.renterIncome) * 1.02])
    .range([0, innerWidth])
    .nice();
  const y = d3.scaleLinear().domain([20, 80]).range([innerHeight, 0]);
  const group = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xTicks = x.ticks(narrow ? 4 : 6);
  group
    .selectAll(".x-grid")
    .data(xTicks)
    .join("line")
    .attr("class", "grid-line")
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", 0)
    .attr("y2", innerHeight);
  group
    .selectAll(".y-grid")
    .data(y.ticks(narrow ? 4 : 6))
    .join("line")
    .attr("class", "grid-line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", y)
    .attr("y2", y);

  group
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(xTicks)
        .tickFormat((value) => `$${d3.format("~s")(value)}`)
        .tickSize(0)
        .tickPadding(10)
    )
    .call((axis) => axis.select(".domain").remove());

  group
    .append("g")
    .attr("class", "axis")
    .call(
      d3
        .axisLeft(y)
        .tickValues([30, 40, 50, 60, 70])
        .tickFormat((value) => `${value}%`)
        .tickSize(0)
        .tickPadding(10)
    )
    .call((axis) => axis.select(".domain").remove());

  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + (narrow ? 43 : 50))
    .attr("text-anchor", "middle")
    .text("Median renter household income");

  if (!narrow || height >= 340) {
    group
      .append("text")
      .attr("class", "chart-label")
      .attr("x", -innerHeight / 2)
      .attr("y", narrow ? -34 : -45)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .text("Cost-burdened share");
  }

  const clipId = "scatter-clip";
  group
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight);

  group
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll(".scatter-point")
    .data(rows)
    .join("circle")
    .attr("class", (county) =>
      county.stateAbbr === "FL"
        ? "scatter-point is-featured"
        : "scatter-point"
    )
    .attr("cx", (county) => x(county.renterIncome))
    .attr("cy", (county) => y(county.burdenRate))
    .attr("r", (county) =>
      county.stateAbbr === "FL" ? 3.6 : narrow ? 2.1 : 2.6
    )
    .attr("fill-opacity", (county) => (county.stateAbbr === "FL" ? 0.8 : 0.28));

  const model = siteData.models.incomeOnly;
  const lineX1 = x.domain()[0];
  const lineX2 = x.domain()[1];
  const lineY1 = model.coefficients[0] + model.coefficients[1] * (lineX1 / 10000);
  const lineY2 = model.coefficients[0] + model.coefficients[1] * (lineX2 / 10000);

  group
    .append("line")
    .attr("class", "regression-line")
    .attr("x1", x(lineX1))
    .attr("x2", x(lineX2))
    .attr("y1", y(lineY1))
    .attr("y2", y(lineY2));

  group
    .append("text")
    .attr("class", "chart-title-small")
    .attr("x", innerWidth - 4)
    .attr("y", 16)
    .attr("text-anchor", "end")
    .text(`R² = ${model.rSquared.toFixed(3)}`);
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", innerWidth - 4)
    .attr("y", 32)
    .attr("text-anchor", "end")
    .text(`${formatInteger(model.n)} counties`);

  if (height >= 300) {
    group
      .append("text")
      .attr("class", "chart-label")
      .attr("x", x(36000) + 9)
      .attr("y", y(72))
      .text("Florida counties");
    group
      .append("circle")
      .attr("cx", x(36000))
      .attr("cy", y(72) - 4)
      .attr("r", 3.6)
      .attr("fill", "#ef5b4c");
  }
}

function drawPairStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const osceola = siteData.featuredCounties.find((county) =>
    county.name.startsWith("Osceola")
  );
  const ward = siteData.featuredCounties.find((county) =>
    county.name.startsWith("Ward")
  );
  if (!osceola || !ward) return;

  const svg = baseSvg(width, height);
  const narrow = width < 520;
  const panelGap = narrow ? 24 : 54;
  const sideMargin = narrow ? 16 : 42;
  const panelWidth = (width - sideMargin * 2 - panelGap) / 2;
  const startY = narrow ? 40 : 46;
  const maxBarHeight = Math.max(100, height - 250);
  const maxBurden = 70;
  const maxRent = 2000;

  const counties = [
    { data: osceola, x: sideMargin, accent: "#ef5b4c" },
    { data: ward, x: sideMargin + panelWidth + panelGap, accent: "#49aa9c" },
  ];

  counties.forEach(({ data, x, accent }) => {
    const labelLines = data.name.split(", ");
    const panel = svg.append("g");
    panel
      .append("text")
      .attr("class", "chart-title-small")
      .attr("x", x)
      .attr("y", 18)
      .text(labelLines[0]);
    panel
      .append("text")
      .attr("class", "chart-label")
      .attr("x", x)
      .attr("y", 33)
      .text(labelLines[1]);

    const barHeight = (data.burdenRate / maxBurden) * maxBarHeight;
    const barY = startY + maxBarHeight - barHeight;
    panel
      .append("rect")
      .attr("x", x)
      .attr("y", startY)
      .attr("width", panelWidth)
      .attr("height", maxBarHeight)
      .attr("fill", "rgba(255,255,255,0.035)");
    panel
      .append("rect")
      .attr("x", x)
      .attr("y", startY + maxBarHeight)
      .attr("width", panelWidth)
      .attr("height", 0)
      .attr("fill", accent)
      .transition()
      .duration(transitionDuration)
      .attr("y", barY)
      .attr("height", barHeight);

    panel
      .append("text")
      .attr("x", x + 10)
      .attr("y", barY + (narrow ? 35 : 46))
      .attr("fill", "#fffdf7")
      .attr("font-family", "Newsreader, Georgia, serif")
      .attr("font-size", narrow ? 36 : 54)
      .text(formatPercent(data.burdenRate));

    const detailsY = startY + maxBarHeight + 36;
    panel
      .append("text")
      .attr("class", "chart-label")
      .attr("x", x)
      .attr("y", detailsY)
      .text("Median renter income");
    panel
      .append("text")
      .attr("class", "chart-title-small")
      .attr("x", x)
      .attr("y", detailsY + 20)
      .text(formatCurrency(data.renterIncome));

    const rentBarWidth = (data.medianRent / maxRent) * panelWidth;
    panel
      .append("text")
      .attr("class", "chart-label")
      .attr("x", x)
      .attr("y", detailsY + 53)
      .text(`Median rent ${formatCurrency(data.medianRent)}`);
    panel
      .append("rect")
      .attr("x", x)
      .attr("y", detailsY + 62)
      .attr("width", panelWidth)
      .attr("height", 6)
      .attr("fill", "rgba(255,255,255,0.09)");
    panel
      .append("rect")
      .attr("x", x)
      .attr("y", detailsY + 62)
      .attr("width", rentBarWidth)
      .attr("height", 6)
      .attr("fill", accent);
  });

  if (!narrow) {
    svg
      .append("text")
      .attr("class", "chart-label")
      .attr("x", width / 2)
      .attr("y", height - 17)
      .attr("text-anchor", "middle")
      .text("Shared scale: 0–70% of renter households cost-burdened");
  }
}

function drawModelStage() {
  const { width, height } = chartBounds();
  if (width < 40 || height < 40) return;

  const model = siteData.models.incomeAndRent;
  const svg = baseSvg(width, height);
  const narrow = width < 520;
  const margin = {
    top: 48,
    right: narrow ? 18 : 34,
    bottom: 48,
    left: narrow ? 106 : 150,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([-10, 5]).range([0, innerWidth]);
  const rows = [
    {
      label: "+$10k renter income",
      value: model.incomeSlopePer10000,
      note: "8.3 points lower",
      className: "coefficient-negative",
    },
    {
      label: "+$100 median rent",
      value: model.rentSlopePer100,
      note: "3.6 points higher",
      className: "coefficient-positive",
    },
  ];
  const rowHeight = Math.min(92, innerHeight * 0.38);
  const group = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  group
    .selectAll(".model-grid")
    .data([-10, -8, -6, -4, -2, 0, 2, 4])
    .join("line")
    .attr("class", "grid-line")
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", 0)
    .attr("y2", innerHeight);

  rows.forEach((row, index) => {
    const y = rowHeight * index + 30;
    const zero = x(0);
    const endpoint = x(row.value);
    const barX = Math.min(zero, endpoint);
    const barWidth = Math.abs(endpoint - zero);

    group
      .append("text")
      .attr("class", "chart-label-strong")
      .attr("x", -margin.left + 10)
      .attr("y", y + 5)
      .text(row.label);
    group
      .append("rect")
      .attr("class", row.className)
      .attr("x", barX)
      .attr("y", y - 12)
      .attr("width", 0)
      .attr("height", 24)
      .transition()
      .duration(transitionDuration)
      .attr("width", barWidth);
    group
      .append("text")
      .attr("x", row.value < 0 ? endpoint + 10 : endpoint - 9)
      .attr("y", y + 4)
      .attr("text-anchor", row.value < 0 ? "start" : "end")
      .attr("class", "chart-title-small")
      .attr("fill", "#fffdf7")
      .text(row.value.toFixed(1));
    group
      .append("text")
      .attr("class", "chart-label")
      .attr("x", row.value < 0 ? endpoint + 10 : endpoint - 9)
      .attr("y", y + 21)
      .attr("text-anchor", row.value < 0 ? "start" : "end")
      .attr("fill", "rgba(255,253,247,0.75)")
      .text("points");
  });

  group
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", -8)
    .attr("y2", innerHeight)
    .attr("stroke", "rgba(255,253,247,0.7)")
    .attr("stroke-width", 1.5);

  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", x(0))
    .attr("y", innerHeight + 29)
    .attr("text-anchor", "middle")
    .text(narrow ? "None" : "No association");
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", x(narrow ? -9 : -8))
    .attr("y", innerHeight + 29)
    .attr("text-anchor", "middle")
    .text(narrow ? "Lower" : "Lower burden");
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", x(narrow ? 4 : 3.5))
    .attr("y", innerHeight + 29)
    .attr("text-anchor", "middle")
    .text(narrow ? "Higher" : "Higher burden");

  group
    .append("text")
    .attr("x", innerWidth - 2)
    .attr("y", -4)
    .attr("text-anchor", "end")
    .attr("fill", "#efb447")
    .attr("font-family", "Newsreader, Georgia, serif")
    .attr("font-size", narrow ? 28 : 36)
    .text(`R² ${model.rSquared.toFixed(2)}`);
  group
    .append("text")
    .attr("class", "chart-label")
    .attr("x", innerWidth - 2)
    .attr("y", 20)
    .attr("text-anchor", "end")
    .text("adjusted associations");
}

function renderStage(stage) {
  if (!siteData || !stage) return;
  if (activeStage === stage) return;
  activeStage = stage;
  clearChart();

  const metadata = narrative[stage];
  vizKicker.textContent = metadata.kicker;
  vizStatus.textContent = metadata.status;
  chartCaption.textContent = metadata.caption;
  chartElement.setAttribute("aria-label", metadata.aria);

  if (stage === "burden") drawBurdenStage();
  if (stage === "income") drawIncomeStage();
  if (stage === "map") drawMapStage(false);
  if (stage === "florida") drawMapStage(true);
  if (stage === "states") drawStatesStage();
  if (stage === "scatter") drawScatterStage();
  if (stage === "pair") drawPairStage();
  if (stage === "model") drawModelStage();
}

function showTooltipAt(event) {
  const shellRect = chartTooltip.parentElement.getBoundingClientRect();
  const pointerX =
    event.clientX ??
    event.target.getBoundingClientRect().left +
      event.target.getBoundingClientRect().width / 2;
  const pointerY =
    event.clientY ??
    event.target.getBoundingClientRect().top +
      event.target.getBoundingClientRect().height / 2;
  const maxLeft = shellRect.width - 210;
  const maxTop = shellRect.height - 100;
  const left = Math.max(8, Math.min(maxLeft, pointerX - shellRect.left + 13));
  const top = Math.max(8, Math.min(maxTop, pointerY - shellRect.top + 13));
  chartTooltip.style.left = `${left}px`;
  chartTooltip.style.top = `${top}px`;
  chartTooltip.classList.add("is-visible");
}

function showCountyTooltip(event, county) {
  chartTooltip.innerHTML = `
    <strong>${county.name}</strong>
    ${formatPercent(county.burdenRate)} cost-burdened<br>
    ${formatPercent(county.severeRate)} severely burdened<br>
    ${formatCurrency(county.medianRent)} median rent
  `;
  showTooltipAt(event);
}

function showStateTooltip(event, state) {
  chartTooltip.innerHTML = `
    <strong>${state.name}</strong>
    ${formatPercent(state.burdenRate)} cost-burdened<br>
    ${formatCurrency(state.medianRent)} median rent<br>
    ${formatInteger(state.renterHouseholds)} renter households
  `;
  showTooltipAt(event);
}

function hideTooltip() {
  chartTooltip.classList.remove("is-visible");
}

function updateActiveStep() {
  const mobile = window.innerWidth <= 860;
  const shellRect = document.querySelector(".viz-shell").getBoundingClientRect();
  const anchor = mobile
    ? Math.min(window.innerHeight - 80, shellRect.bottom + 18)
    : window.innerHeight * 0.5;
  let closest = null;
  let distance = Infinity;

  steps.forEach((step) => {
    const rect = step.getBoundingClientRect();
    const comparisonPoint = mobile
      ? rect.top
      : rect.top + Math.min(rect.height, window.innerHeight) / 2;
    const stepDistance = Math.abs(comparisonPoint - anchor);
    if (stepDistance < distance) {
      closest = step;
      distance = stepDistance;
    }
  });

  if (!closest) return;
  steps.forEach((step) => step.classList.toggle("is-active", step === closest));
  renderStage(closest.dataset.step);
}

function updateProgress() {
  const scrollable =
    document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
  progressBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
}

let scrollFrame = null;
function onScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    updateActiveStep();
    updateProgress();
    scrollFrame = null;
  });
}

function setupSourcesDialog() {
  const dialog = document.querySelector("#sources-dialog");
  const openButton = document.querySelector("#sources-button");
  const closeButton = document.querySelector("#dialog-close");

  openButton.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('a[href="#methods"]').addEventListener("click", () => {
    dialog.close();
  });
}

function setupResizeHandler() {
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const stageToRedraw = activeStage;
      activeStage = null;
      renderStage(stageToRedraw);
    }, 180);
  });
}

async function init() {
  try {
    const [data, countyTopology, stateTopology] = await Promise.all([
      d3.json("data/site-data.json"),
      d3.json("data/counties-2024.topo.json"),
      d3.json("data/states-10m.json"),
    ]);

    siteData = data;
    countyFeatures = topojson
      .feature(countyTopology, countyTopology.objects.counties)
      .features.map((feature) => ({
        ...feature,
        id: feature.properties?.GEOID ?? feature.id,
      }));
    stateFeatures = topojson.feature(
      stateTopology,
      stateTopology.objects.states
    ).features;
    countyById = new Map(
      siteData.counties.map((county) => [county.fips, county])
    );

    drawHeroGrid();
    setupSourcesDialog();
    setupResizeHandler();
    updateActiveStep();
    updateProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("click", hideTooltip);
    lucide.createIcons();
  } catch (error) {
    console.error(error);
    chartCaption.textContent =
      "The chart data could not be loaded. The downloadable CSVs still contain the full dataset.";
  }
}

init();
