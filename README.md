# Priced Out

A student data scrollytelling story about rent burdens in the United States.

Author: Haoyan Zhong, Duke University

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The site uses local JSON files, so it should be served through HTTP rather than
opened directly from the filesystem.

## Data

- Source: U.S. Census Bureau, American Community Survey 2020-2024 five-year estimates
- Access layer: Census Reporter API
- Rent burden: table `B25070`
- Median gross rent: table `B25064`
- Median household income by tenure: table `B25119`
- Housing tenure: table `B25003`
- Population: table `B01003`
- County boundaries: U.S. Census Bureau 2024 cartographic boundary file

Cost-burdened renter households spend 30% or more of household income on gross
rent. Severely burdened households spend 50% or more. Households with a
not-computed rent-to-income ratio are excluded from the denominator.

The cleaned county and state tables are available as CSV files in `data/`.

## Reproduce

The raw Census Reporter responses and boundary files are checked into `data/`.
Rebuild the cleaned site dataset with:

```bash
node scripts/prepare-data.mjs
```

## Statistical note

The county regressions use ordinary least squares on county-level estimates for
counties with at least 1,000 renter households and complete income, rent, and
burden data. These are ecological associations, not causal effects or
household-level estimates.
