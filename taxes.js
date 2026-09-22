// Curated statutory tax snapshot, mid-2026. Country → [rate %, note].
// income   = top marginal personal income-tax rate (national; typical
//            sub-national or surtaxes noted). corporate = headline statutory
//            corporate income-tax rate (combined where sub-national applies).
// Unlisted countries show no data. Before deductions, credits, treaties —
// a planning summary, not tax advice.
const TAXES = {
  updated: "2026-09",

  income: {
    // — zero / near-zero —
    AE: [0, "No personal income tax"], SA: [0, "No personal income tax"], QA: [0, "No personal income tax"],
    KW: [0, "No personal income tax"], BH: [0, "No personal income tax"], OM: [0, "5% tax on high earners planned from 2028"],
    BS: [0, "No income tax"], BM: [0, "No income tax; payroll tax instead"], KY: [0, "No income tax"],
    MC: [0, "No income tax (except French nationals)"], BN: [0, "No personal income tax"], VU: [0, "No income tax"],
    AG: [0, "No personal income tax"], KN: [0, "No personal income tax"],
    // — flat / low —
    BG: [10, "Flat 10%"], RO: [10, "Flat 10%"], KZ: [10, "Flat 10%"], BA: [10, "Flat 10%"], MN: [10, "Flat 10%"],
    MK: [10, "Flat 10%"], KG: [10, "Flat 10%"], PY: [10, "Top 10%"], MD: [12, "Flat 12%"], UZ: [12, "Flat 12%"],
    BY: [13, "Flat 13% (25% above threshold)"], HU: [15, "Flat 15%"], ME: [15, "15% top"], RS: [15, "10% salary; 15% other income"],
    HK: [17, "Progressive to 17%; standard rate 15–16%"], UA: [18, "Flat 18% + 5% military levy"], GE: [20, "Flat 20%"],
    LT: [32, "20% / 32% above threshold"], EE: [22, "Flat 22% since 2025"], AM: [20, "Flat 20%"], AZ: [25, "14% / 25%"],
    CZ: [23, "15% / 23%"], SK: [25, "19% / 25%"], LV: [33, "25.5% / 33% above threshold"], AL: [23, "Top 23%"],
    SG: [24, "Top 24% (residents)"], IQ: [15, "Top 15%"], JO: [30, "Top 30%"], LB: [25, "Top 25%"],
    // — Europe —
    AT: [55, "55% above €1M; 50% top ordinary bracket"], BE: [50, "50% + municipal surcharge (~7% of tax)"],
    DK: [56, "~55.9% incl. municipal and labour-market tax"], FI: [57, "~57% incl. municipal tax"],
    FR: [45, "45% + 3–4% high-income contribution"], DE: [45, "45% + 5.5% solidarity surcharge (≈47.5%)"],
    GR: [44, "Top 44%"], IE: [40, "40% + USC 8% + PRSI (≈52% marginal)"], IT: [43, "43% + regional/municipal (~46%)"],
    LU: [42, "42% + 7–9% surcharge (≈45.8%)"], NL: [49.5, "Top 49.5%"], NO: [47.4, "22% + bracket tax up to 17.7%"],
    PT: [48, "48% + solidarity surtax up to 5%"], ES: [47, "47% state top; up to ~54% with regional"],
    SE: [52, "~52% incl. municipal (state 20% + municipal ~32%)"], CH: [40, "~40% typical combined; varies widely by canton (Zug ~22%, Geneva ~45%)"],
    GB: [45, "45% (Scotland 48%)"], IS: [46.3, "Top 46.3%"], MT: [35, "Top 35%"], CY: [35, "Top 35%"],
    PL: [32, "12% / 32% (+4% solidarity above PLN 1M)"], SI: [50, "Top 50%"], HR: [30, "20% / 30% + city surtax"],
    TR: [40, "Top 40%"], IL: [50, "47% + 3% surtax"], RU: [22, "Progressive 13–22% since 2025"],
    // — Americas —
    US: [37, "37% federal; + state up to 13.3% (CA)"], CA: [33, "33% federal; ~54% top combined with provinces"],
    MX: [35, "Top 35%"], BR: [27.5, "Top 27.5%"], AR: [35, "Top 35%"], CL: [40, "Top 40%"], CO: [39, "Top 39%"],
    PE: [30, "Top 30%"], UY: [36, "Top 36%"], EC: [37, "Top 37%"], BO: [13, "Flat 13%"], VE: [34, "Top 34%"],
    CR: [25, "Top 25%"], PA: [25, "Top 25%"], DO: [25, "Top 25%"], GT: [7, "Top 7%"], JM: [30, "25% / 30%"],
    TT: [30, "25% / 30%"], HN: [25, "Top 25%"], SV: [30, "Top 30%"], NI: [30, "Top 30%"],
    // — Asia-Pacific —
    JP: [45, "45% + 10% local (≈55.95%)"], KR: [45, "45% + 10% local (≈49.5%)"], CN: [45, "Top 45%"],
    IN: [30, "30% + surcharge/cess (≈39% new regime)"], ID: [35, "Top 35%"], TH: [35, "Top 35%"], VN: [35, "Top 35%"],
    PH: [35, "Top 35%"], MY: [30, "Top 30%"], TW: [40, "Top 40%"], AU: [45, "45% + 2% Medicare levy"],
    NZ: [39, "Top 39%"], PK: [35, "Top 35%"], BD: [30, "Top 30%"], LK: [36, "Top 36%"], NP: [39, "Top 39%"],
    KH: [20, "Top 20%"], MM: [25, "Top 25%"], MO: [12, "Top 12%"], FJ: [20, "Top 20%"], PG: [42, "Top 42%"],
    // — Africa & Middle East —
    ZA: [45, "Top 45%"], NG: [25, "Top 25% (2025 Tax Act)"], KE: [35, "Top 35%"], EG: [27.5, "Top 27.5%"],
    MA: [37, "Top 37%"], DZ: [35, "Top 35%"], TN: [35, "Top 35%"], GH: [35, "Top 35%"], ET: [35, "Top 35%"],
    TZ: [30, "Top 30%"], UG: [40, "Top 40%"], RW: [30, "Top 30%"], ZM: [37, "Top 37%"], AO: [25, "Top 25%"],
    MZ: [32, "Top 32%"], BW: [25, "Top 25%"], NA: [37, "Top 37%"], MU: [20, "Top 20%"], SN: [43, "Top 43%"],
    ZW: [40, "Top 40%"], IR: [25, "Top 25%"], CM: [38.5, "Top 38.5% incl. surcharge"],
  },

  corporate: {
    AE: [9, "9% since 2023; 0% below AED 375k"], SA: [20, "20% (Zakat 2.5% for GCC-owned)"], QA: [10, "10%"],
    KW: [15, "15% on foreign-owned companies"], BH: [0, "0%; 15% top-up tax for large multinationals since 2025"],
    OM: [15, "15%"], BS: [0, "0% (business licence fees; 15% for large MNEs)"], BM: [0, "0%; 15% for large MNEs from 2025"],
    KY: [0, "0%"], VG: [0, "0%"], VU: [0, "0%"], IM: [0, "0% (banking 10%)"], JE: [0, "0% (financial services 10%)"],
    GG: [0, "0% (financial services 10%)"], HU: [9, "9% — lowest in the EU"], ME: [15, "9–15%"], AD: [10, "10%"],
    BG: [10, "10%"], PY: [10, "10%"], MK: [10, "10%"], BA: [10, "10%"], KG: [10, "10%"], MD: [12, "12%"],
    LI: [12.5, "12.5%"], IE: [12.5, "12.5% (15% for large MNEs)"], CY: [12.5, "12.5%"], MO: [12, "12%"],
    GI: [15, "15%"], GE: [15, "15% on distributed profits"], IQ: [15, "15%"], MU: [15, "15%"], UZ: [15, "15%"],
    RS: [15, "15%"], AL: [15, "15%"], LT: [16, "16% since 2025"], RO: [16, "16%"], HK: [16.5, "16.5% (8.25% on first HK$2M)"],
    SG: [17, "17%"], LB: [17, "17%"], HR: [18, "18% (10% small)"], UA: [18, "18%"], AM: [18, "18%"],
    PL: [19, "19% (9% small)"], CH: [19.6, "~19.6% average combined; 12–21% by canton"], CZ: [21, "21%"],
    SK: [21, "21% (24% for large companies)"], TH: [20, "20%"], VN: [20, "20%"], TW: [20, "20%"], JO: [20, "20%"],
    KZ: [20, "20%"], AZ: [20, "20%"], BY: [20, "20%"], LV: [20, "20% on distributed profits"], EE: [22, "22% on distributed profits"],
    FI: [20, "20%"], SE: [20.6, "20.6%"], PT: [20, "20% + surtaxes"], MA: [20, "20% unified by 2026 (35% large)"],
    IS: [21, "21%"], US: [21, "21% federal; ~25.6% average combined with state"], KH: [20, "20%"],
    DK: [22, "22%"], NO: [22, "22%"], SI: [22, "22% (2024–2028)"], GR: [22, "22%"], ID: [22, "22%"],
    EG: [22.5, "22.5%"], MM: [22, "22%"], AT: [23, "23%"], IL: [23, "23%"], LU: [23.9, "~23.9% combined (Luxembourg City)"],
    MY: [24, "24%"], TR: [25, "25%"], RU: [25, "25% since 2025"], GB: [25, "25% (19% small profits)"],
    ES: [25, "25%"], BE: [25, "25%"], NL: [25.8, "25.8% (19% first €200k)"], FR: [25.8, "25% + social contribution"],
    CN: [25, "25% (15% high-tech)"], IN: [25.2, "22% + surcharge/cess; 15% new manufacturing"], PH: [25, "25% (20% small)"],
    UY: [25, "25%"], EC: [25, "25%"], PA: [25, "25%"], DO: [27, "27%"], JM: [25, "25%"], BO: [25, "25%"],
    GT: [25, "25%"], HN: [25, "25%"], AO: [25, "25%"], GH: [25, "25%"], IR: [25, "25%"], MN: [25, "10% / 25%"],
    NP: [25, "25%"], CI: [25, "25%"], CA: [26.2, "15% federal + provincial (≈26.2%)"], KR: [26.4, "24% + local (≈26.4%)"],
    ZA: [27, "27%"], CL: [27, "27%"], IT: [27.9, "24% IRES + 3.9% IRAP"], BD: [27.5, "27.5% (listed 20–22.5%)"],
    NZ: [28, "28%"], PK: [29, "29%"], PE: [29.5, "29.5%"], JP: [29.7, "23.2% national; ≈29.7% combined"],
    DE: [29.9, "15% + solidarity + trade tax (≈29.9%)"], AU: [30, "30% (25% small)"], MX: [30, "30%"], NG: [30, "30%"],
    KE: [30, "30%"], ET: [30, "30%"], TZ: [30, "30%"], UG: [30, "30%"], ZM: [30, "30%"], SN: [30, "30%"],
    LK: [30, "30%"], CR: [30, "30%"], TT: [30, "30%"], SV: [30, "30%"], NI: [30, "30%"], NA: [31, "31%"],
    CM: [33, "33% incl. surcharge"], BR: [34, "34% (IRPJ + CSLL)"], VE: [34, "34%"], AR: [35, "35% top bracket"],
    CO: [35, "35%"], MT: [35, "35% headline (≈5% effective after refunds)"], MZ: [32, "32%"], DZ: [26, "19–26%"],
    TN: [20, "15–20% (35% banks)"], ZW: [25, "25%"], BW: [22, "22%"], RW: [28, "28%"], SD: [35, "Up to 35%"],
    HT: [30, "30%"], BB: [9, "9% (5.5% below BBD 1M)"], FJ: [25, "25%"], PG: [30, "30%"],
  },
};
