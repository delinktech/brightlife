/**
 * Brightlife SHG - CIC Money Market Fund Backfill Service
 * Managed by BrightlifeArchivist
 * Backfills official CIC MMF statements from inception (20 May 2021) to 31 July 2026.
 */

const CIC_MMF_ACCOUNT_NUMBER = "02788-001-47379-002";

const CIC_RAW_TRANSACTIONS = [
// Page 1 (May 2021 - May 2022)
  { tid: "2484238", date: "2021-05-20", desc: "PURCHASE (Deposit)", purchase: 200000.00, interest: 0, withdrawal: 0, wht: 0, balance: 200000.00 },
  { tid: "2524433", date: "2021-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 595.26, withdrawal: 0, wht: 89.29, balance: 200505.97 },
  { tid: "2695219", date: "2021-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1497.81, withdrawal: 0, wht: 224.67, balance: 201779.11 },
  { tid: "2795500", date: "2021-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1550.63, withdrawal: 0, wht: 232.59, balance: 203097.15 },
  { tid: "2864186", date: "2021-08-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1511.97, withdrawal: 0, wht: 226.79, balance: 204382.32 },
  { tid: "2934661", date: "2021-09-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1461.18, withdrawal: 0, wht: 219.18, balance: 205624.32 },
  { tid: "3004276", date: "2021-10-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1521.92, withdrawal: 0, wht: 228.29, balance: 206917.95 },
  { tid: "3078994", date: "2021-11-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1499.96, withdrawal: 0, wht: 224.99, balance: 208192.92 },
  { tid: "3157151", date: "2021-12-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1585.23, withdrawal: 0, wht: 237.78, balance: 209540.36 },
  { tid: "3236385", date: "2022-01-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1587.67, withdrawal: 0, wht: 238.15, balance: 210889.88 },
  { tid: "3316724", date: "2022-02-28", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1385.62, withdrawal: 0, wht: 207.84, balance: 212067.65 },
  { tid: "3369909", date: "2022-03-29", desc: "PURCHASE (Deposit)", purchase: 300000.00, interest: 0, withdrawal: 0, wht: 0, balance: 512067.65 },
  { tid: "3407079", date: "2022-03-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1773.06, withdrawal: 0, wht: 265.96, balance: 513574.75 },
  { tid: "3493109", date: "2022-04-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3691.88, withdrawal: 0, wht: 553.78, balance: 516712.85 },
  { tid: "3587861", date: "2022-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3853.14, withdrawal: 0, wht: 577.97, balance: 519988.02 },

  // Page 2 (Jun 2022 - Jan 2024)
  { tid: "3686376", date: "2022-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3715.88, withdrawal: 0, wht: 557.38, balance: 523146.51 },
  { tid: "3782537", date: "2022-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3848.84, withdrawal: 0, wht: 577.33, balance: 526418.02 },
  { tid: "3884127", date: "2022-08-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3886.69, withdrawal: 0, wht: 583.00, balance: 529721.70 },
  { tid: "3985187", date: "2022-09-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3797.67, withdrawal: 0, wht: 569.65, balance: 532949.72 },
  { tid: "4203975", date: "2022-10-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3962.46, withdrawal: 0, wht: 594.37, balance: 536317.81 },
  { tid: "4307929", date: "2022-11-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3866.15, withdrawal: 0, wht: 579.92, balance: 539604.03 },
  { tid: "4364157", date: "2022-12-19", desc: "WITHDRAWAL (EFT)", purchase: 0, interest: 0, withdrawal: 500000.00, wht: 0, balance: 39604.03 },
  { tid: "4416522", date: "2022-12-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 2466.84, withdrawal: 0, wht: 370.03, balance: 41700.84 },
  { tid: "4530053", date: "2023-01-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 312.85, withdrawal: 0, wht: 46.93, balance: 41966.76 },
  { tid: "4700798", date: "2023-02-28", desc: "INTEREST (INTEREST)", purchase: 0, interest: 286.23, withdrawal: 0, wht: 42.93, balance: 42210.05 },
  { tid: "4769738", date: "2023-03-20", desc: "PURCHASE (RTGS)", purchase: 300000.00, interest: 0, withdrawal: 0, wht: 0, balance: 342210.05 },
  { tid: "4924364", date: "2023-03-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1199.28, withdrawal: 0, wht: 179.89, balance: 343229.44 },
  { tid: "5038213", date: "2023-04-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 2576.87, withdrawal: 0, wht: 386.53, balance: 345419.78 },
  { tid: "5163326", date: "2023-05-26", desc: "WITHDRAWAL", purchase: 0, interest: 0, withdrawal: 160000.00, wht: 0, balance: 185419.78 },
  { tid: "5374535", date: "2023-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 2441.55, withdrawal: 0, wht: 366.23, balance: 187495.10 },
  { tid: "5601163", date: "2023-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1421.14, withdrawal: 0, wht: 213.17, balance: 188703.07 },
  { tid: "5753949", date: "2023-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1521.88, withdrawal: 0, wht: 228.28, balance: 189996.67 },
  { tid: "5902910", date: "2023-08-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1594.98, withdrawal: 0, wht: 239.25, balance: 191352.41 },
  { tid: "6124141", date: "2023-09-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1583.24, withdrawal: 0, wht: 237.49, balance: 192698.17 },
  { tid: "6492893", date: "2023-10-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1725.68, withdrawal: 0, wht: 258.85, balance: 194165.00 },
  { tid: "6785160", date: "2023-11-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1752.38, withdrawal: 0, wht: 262.86, balance: 195654.52 },
  { tid: "6942830", date: "2023-12-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1859.47, withdrawal: 0, wht: 278.92, balance: 197235.07 },
  { tid: "7106632", date: "2024-01-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 1910.64, withdrawal: 0, wht: 286.60, balance: 198859.11 },

  // Page 3 (Feb 2024 - Sep 2025)
  { tid: "7204688", date: "2024-02-20", desc: "PURCHASE (RTGS)", purchase: 180000.00, interest: 0, withdrawal: 0, wht: 0, balance: 378859.11 },
  { tid: "7319697", date: "2024-02-29", desc: "INTEREST (INTEREST)", purchase: 0, interest: 2429.95, withdrawal: 0, wht: 364.49, balance: 380924.56 },
  { tid: "7531070", date: "2024-03-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3904.22, withdrawal: 0, wht: 585.63, balance: 384243.14 },
  { tid: "7739361", date: "2024-04-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 3947.70, withdrawal: 0, wht: 592.16, balance: 387598.69 },
  { tid: "7921255", date: "2024-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4113.22, withdrawal: 0, wht: 616.98, balance: 391094.93 },
  { tid: "8105424", date: "2024-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4005.24, withdrawal: 0, wht: 600.79, balance: 394499.38 },
  { tid: "8315337", date: "2024-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4278.86, withdrawal: 0, wht: 641.83, balance: 398136.41 },
  { tid: "8517009", date: "2024-08-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4365.43, withdrawal: 0, wht: 654.81, balance: 401847.03 },
  { tid: "8631525", date: "2024-09-18", desc: "PURCHASE (RTGS)", purchase: 150000.00, interest: 0, withdrawal: 0, wht: 0, balance: 551847.03 },
  { tid: "8729511", date: "2024-09-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4953.69, withdrawal: 0, wht: 743.05, balance: 556057.67 },
  { tid: "8948109", date: "2024-10-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6088.76, withdrawal: 0, wht: 913.31, balance: 561233.11 },
  { tid: "9163784", date: "2024-11-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 5838.36, withdrawal: 0, wht: 875.75, balance: 566195.72 },
  { tid: "9390103", date: "2024-12-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 5802.96, withdrawal: 0, wht: 870.44, balance: 571128.24 },
  { tid: "9633290", date: "2025-01-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 5784.20, withdrawal: 0, wht: 867.63, balance: 576044.81 },
  { tid: "9872740", date: "2025-02-28", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4989.65, withdrawal: 0, wht: 748.45, balance: 580286.02 },
  { tid: "10119898", date: "2025-03-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 5245.15, withdrawal: 0, wht: 786.77, balance: 584744.40 },
  { tid: "10387924", date: "2025-04-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4986.35, withdrawal: 0, wht: 747.95, balance: 588982.80 },
  { tid: "10646119", date: "2025-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4899.37, withdrawal: 0, wht: 734.91, balance: 593147.26 },
  { tid: "10900621", date: "2025-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4590.63, withdrawal: 0, wht: 688.60, balance: 597049.30 },
  { tid: "11169619", date: "2025-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4355.52, withdrawal: 0, wht: 653.33, balance: 600751.49 },
  { tid: "11317997", date: "2025-08-25", desc: "PURCHASE (MPESA)", purchase: 20000.00, interest: 0, withdrawal: 0, wht: 0, balance: 620751.49 },
  { tid: "11436177", date: "2025-08-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4241.07, withdrawal: 0, wht: 636.16, balance: 624356.40 },
  { tid: "11584649", date: "2025-09-23", desc: "PURCHASE (RTGS)", purchase: 100000.00, interest: 0, withdrawal: 0, wht: 0, balance: 724356.40 },

  // Page 4 (Sep 2025 - Dec 2025)
  { tid: "11616865", date: "2025-09-30", desc: "PURCHASE (RTGS)", purchase: 150000.00, interest: 0, withdrawal: 0, wht: 0, balance: 874356.40 },
  { tid: "11707123", date: "2025-09-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 4432.20, withdrawal: 0, wht: 664.83, balance: 878123.77 },
  { tid: "11876004", date: "2025-10-30", desc: "PURCHASE (MPESA)", purchase: 100.00, interest: 0, withdrawal: 0, wht: 0, balance: 878223.77 },
  { tid: "11876239", date: "2025-10-31", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 879223.77 },
  { tid: "11978992", date: "2025-10-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6130.78, withdrawal: 0, wht: 919.62, balance: 884434.93 },
  { tid: "12051066", date: "2025-11-10", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 885434.93 },
  { tid: "12052462", date: "2025-11-10", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 886434.93 },
  { tid: "12061351", date: "2025-11-11", desc: "PURCHASE (MPESA)", purchase: 500.00, interest: 0, withdrawal: 0, wht: 0, balance: 886934.93 },
  { tid: "12080902", date: "2025-11-17", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 887934.93 },
  { tid: "12084159", date: "2025-11-17", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 888934.93 },
  { tid: "12085406", date: "2025-11-17", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 891934.93 },
  { tid: "12085414", date: "2025-11-17", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 894934.93 },
  { tid: "12085416", date: "2025-11-17", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 895934.93 },
  { tid: "12236895", date: "2025-11-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6015.47, withdrawal: 0, wht: 902.32, balance: 901048.08 },
  { tid: "12143082", date: "2025-12-01", desc: "PURCHASE (MPESA)", purchase: 31617.00, interest: 0, withdrawal: 0, wht: 0, balance: 932665.08 },
  { tid: "12311249", date: "2025-12-08", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 935665.08 },
  { tid: "12311266", date: "2025-12-08", desc: "PURCHASE (MPESA)", purchase: 4000.00, interest: 0, withdrawal: 0, wht: 0, balance: 939665.08 },
  { tid: "12311292", date: "2025-12-08", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 942665.08 },
  { tid: "12311378", date: "2025-12-08", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 943665.08 },
  { tid: "12336901", date: "2025-12-15", desc: "PURCHASE (MPESA)", purchase: 500.00, interest: 0, withdrawal: 0, wht: 0, balance: 944165.08 },
  { tid: "12344439", date: "2025-12-16", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 947165.08 },
  { tid: "12354709", date: "2025-12-17", desc: "PURCHASE (MPESA)", purchase: 2500.00, interest: 0, withdrawal: 0, wht: 0, balance: 949665.08 },
  { tid: "12509317", date: "2025-12-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6591.90, withdrawal: 0, wht: 988.79, balance: 955268.20 },

  // Page 5 (Jan 2026 - Feb 2026)
  { tid: "12588196", date: "2026-01-09", desc: "PURCHASE (MPESA)", purchase: 2500.00, interest: 0, withdrawal: 0, wht: 0, balance: 957768.20 },
  { tid: "12664771", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 15000.00, interest: 0, withdrawal: 0, wht: 0, balance: 972768.20 },
  { tid: "12666040", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 973768.20 },
  { tid: "12666045", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 974768.20 },
  { tid: "12666047", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 975768.20 },
  { tid: "12666051", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 976768.20 },
  { tid: "12666067", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 977768.20 },
  { tid: "12666112", date: "2026-01-26", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 978768.20 },
  { tid: "12666510", date: "2026-01-27", desc: "PURCHASE (MPESA)", purchase: 5000.00, interest: 0, withdrawal: 0, wht: 0, balance: 983768.20 },
  { tid: "12669092", date: "2026-01-27", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 986768.20 },
  { tid: "12793185", date: "2026-01-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6701.39, withdrawal: 0, wht: 1005.21, balance: 992464.38 },
  { tid: "12870368", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 995464.38 },
  { tid: "12870377", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 996464.38 },
  { tid: "12870438", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 997464.38 },
  { tid: "12870441", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 998464.38 },
  { tid: "12870446", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 999464.38 },
  { tid: "12870474", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1000464.38 },
  { tid: "12870480", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 2000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1002464.38 },
  { tid: "12870538", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 2500.00, interest: 0, withdrawal: 0, wht: 0, balance: 1004964.38 },
  { tid: "12870558", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1005964.38 },
  { tid: "12870858", date: "2026-02-09", desc: "PURCHASE (MPESA)", purchase: 4000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1009964.38 },
  { tid: "12875077", date: "2026-02-10", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1012964.38 },
  { tid: "12903768", date: "2026-02-16", desc: "PURCHASE (MPESA)", purchase: 10000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1022964.38 },

  // Page 6 (Feb 2026 - Jun 2026)
  { tid: "13214759", date: "2026-02-28", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6348.13, withdrawal: 0, wht: 952.22, balance: 1028360.29 },
  { tid: "13477840", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1029360.29 },
  { tid: "13477846", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1030360.29 },
  { tid: "13477907", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 8000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1038360.29 },
  { tid: "13477918", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1039360.29 },
  { tid: "13477954", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1040360.29 },
  { tid: "13477966", date: "2026-03-09", desc: "PURCHASE (MPESA)", purchase: 2000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1042360.29 },
  { tid: "13483485", date: "2026-03-10", desc: "PURCHASE (MPESA)", purchase: 6750.00, interest: 0, withdrawal: 0, wht: 0, balance: 1049110.29 },
  { tid: "13518495", date: "2026-03-17", desc: "PURCHASE (MPESA)", purchase: 4000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1053110.29 },
  { tid: "13568098", date: "2026-03-30", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1054110.29 },
  { tid: "13739013", date: "2026-03-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 7236.67, withdrawal: 0, wht: 1085.50, balance: 1060261.46 },
  { tid: "14284482", date: "2026-04-10", desc: "PURCHASE (MPESA)", purchase: 1800.00, interest: 0, withdrawal: 0, wht: 0, balance: 1062061.46 },
  { tid: "14302653", date: "2026-04-13", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1063061.46 },
  { tid: "14302654", date: "2026-04-13", desc: "PURCHASE (MPESA)", purchase: 1500.00, interest: 0, withdrawal: 0, wht: 0, balance: 1064561.46 },
  { tid: "14302655", date: "2026-04-13", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1067561.46 },
  { tid: "14302656", date: "2026-04-13", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1068561.46 },
  { tid: "14307685", date: "2026-04-15", desc: "PURCHASE (MPESA)", purchase: 3000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1071561.46 },
  { tid: "14939256", date: "2026-04-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 7121.27, withdrawal: 0, wht: 1068.19, balance: 1077614.54 },
  { tid: "15084425", date: "2026-05-08", desc: "PURCHASE (MPESA)", purchase: 1200.00, interest: 0, withdrawal: 0, wht: 0, balance: 1078814.54 },
  { tid: "15221116", date: "2026-05-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 7438.11, withdrawal: 0, wht: 1115.72, balance: 1085136.93 },
  { tid: "15424663", date: "2026-06-18", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 1086136.93 },
  { tid: "15434427", date: "2026-06-19", desc: "WITHDRAWAL (RTGS)", purchase: 0, interest: 0, withdrawal: 250000.00, wht: 0, balance: 836136.93 },
  { tid: "15584297", date: "2026-06-30", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6577.67, withdrawal: 0, wht: 986.65, balance: 841727.95 },

  // Page 7 (Jul 2026)
  { tid: "15636332", date: "2026-07-03", desc: "PURCHASE (MPESA)", purchase: 20000.00, interest: 0, withdrawal: 0, wht: 0, balance: 861727.95 },
  { tid: "15636339", date: "2026-07-03", desc: "PURCHASE (MPESA)", purchase: 2163.00, interest: 0, withdrawal: 0, wht: 0, balance: 863890.95 },
  { tid: "15694348", date: "2026-07-13", desc: "PURCHASE (MPESA)", purchase: 10000.00, interest: 0, withdrawal: 0, wht: 0, balance: 873890.95 },
  { tid: "15694357", date: "2026-07-13", desc: "PURCHASE (MPESA)", purchase: 1000.00, interest: 0, withdrawal: 0, wht: 0, balance: 874890.95 },
  { tid: "15694371", date: "2026-07-13", desc: "PURCHASE (MPESA)", purchase: 2000.00, interest: 0, withdrawal: 0, wht: 0, balance: 876890.95 },
  { tid: "15696520", date: "2026-07-14", desc: "PURCHASE (MPESA)", purchase: 14000.00, interest: 0, withdrawal: 0, wht: 0, balance: 890890.95 },
  { tid: "15712114", date: "2026-07-16", desc: "PURCHASE (MPESA)", purchase: 3500.00, interest: 0, withdrawal: 0, wht: 0, balance: 894390.95 },
  { tid: "15892052", date: "2026-07-31", desc: "INTEREST (INTEREST)", purchase: 0, interest: 6071.38, withdrawal: 0, wht: 910.71, balance: 899551.62 }
];

/**
 * Executes full backfill for CIC MMF:
 * 1. Populates 'CIC Transactions' sheet with all 138 itemized transactions.
 * 2. Aggregates monthly statements into 'Fund Statements' (May 2021 to July 2026).
 * 3. Updates 'Accounts' sheet row for CIC MMF.
 */
function backfillCicStatement_() {
  const ss = getSpreadsheet_();
  const results = {
    cicTransactionsCreated: 0,
    fundStatementsAdded: 0,
    accountsUpdated: false
  };

  // 1. Populate 'CIC Transactions' sheet
  let cicSheet = ss.getSheetByName(SHEETS.CIC_TRANSACTIONS);
  if (!cicSheet) {
    cicSheet = ss.insertSheet(SHEETS.CIC_TRANSACTIONS);
  }

  const txHeaders = [
    "Transaction ID",
    "Date",
    "Description",
    "Purchase",
    "Interest",
    "Withdrawal",
    "Withholding Tax",
    "Balance"
  ];

  cicSheet.clear();
  cicSheet.getRange(1, 1, 1, txHeaders.length).setValues([txHeaders]);
  cicSheet.getRange(1, 1, 1, txHeaders.length).setFontWeight("bold").setBackground("#1b4332").setFontColor("#ffffff");
  cicSheet.setFrozenRows(1);

  const txRows = CIC_RAW_TRANSACTIONS.map(function(t) {
    return [
      t.tid,
      t.date,
      t.desc,
      t.purchase || 0,
      t.interest || 0,
      t.withdrawal || 0,
      t.wht || 0,
      t.balance
    ];
  });

  if (txRows.length > 0) {
    cicSheet.getRange(2, 1, txRows.length, txHeaders.length).setValues(txRows);
    results.cicTransactionsCreated = txRows.length;
  }

  // 2. Aggregate monthly statements (May 2021 to July 2026)
  const monthsMap = {};
  CIC_RAW_TRANSACTIONS.forEach(function(t) {
    const ym = t.date.substring(0, 7);
    if (!monthsMap[ym]) {
      monthsMap[ym] = {
        ym: ym,
        purchases: 0,
        interest: 0,
        wht: 0,
        withdrawals: 0,
        closing: 0,
        lastDate: t.date,
        count: 0
      };
    }
    monthsMap[ym].purchases += t.purchase;
    monthsMap[ym].interest += t.interest;
    monthsMap[ym].wht += t.wht;
    monthsMap[ym].withdrawals += t.withdrawal;
    monthsMap[ym].closing = t.balance;
    monthsMap[ym].lastDate = t.date;
    monthsMap[ym].count++;
  });

  const yms = Object.keys(monthsMap).sort();
  let prevClosing = 0;
  const backfillFundRows = [];

  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  yms.forEach(function(ym, idx) {
    const m = monthsMap[ym];
    const opening = idx === 0 ? 0 : prevClosing;
    prevClosing = m.closing;

    const parts = ym.split("-");
    const yr = parts[0];
    const monIdx = parseInt(parts[1], 10) - 1;
    const ref = "CIC-MMF-" + MONTH_NAMES[monIdx] + "-" + yr;

    backfillFundRows.push({
      dateStr: m.lastDate,
      channel: "CIC MMF",
      opening: Math.round(opening * 100) / 100,
      purchases: Math.round(m.purchases * 100) / 100,
      interest: Math.round(m.interest * 100) / 100,
      wht: Math.round(m.wht * 100) / 100,
      netYield: Math.round((m.interest - m.wht) * 100) / 100,
      withdrawals: Math.round(m.withdrawals * 100) / 100,
      closing: Math.round(m.closing * 100) / 100,
      ref: ref
    });
  });

  // Ensure Fund Statements sheet exists
  let fundSheet = ss.getSheetByName(SHEETS.FUND_STATEMENTS);
  if (!fundSheet) {
    fundSheet = ss.insertSheet(SHEETS.FUND_STATEMENTS);
  }

  const fundHeaders = [
    "Statement Date",
    "Fund Channel",
    "Opening Balance",
    "Purchases / Deposits",
    "Gross Interest",
    "Withholding Tax",
    "Net Yield",
    "Withdrawals",
    "Closing Balance",
    "Statement Ref"
  ];

  // Also preserve existing Aug, Sep, Oct 2026 rows
  const postJulyRows = [
    {
      dateStr: "2026-08-31",
      channel: "CIC MMF",
      opening: 899551.62,
      purchases: 6500.00,
      interest: 6186.49,
      wht: 927.97,
      netYield: 5258.52,
      withdrawals: 0,
      closing: 911310.15,
      ref: "CIC-MMF-AUG-2026"
    },
    {
      dateStr: "2026-09-30",
      channel: "CIC MMF",
      opening: 911310.15,
      purchases: 9500.00,
      interest: 6096.37,
      wht: 914.46,
      netYield: 5181.91,
      withdrawals: 0,
      closing: 925992.07,
      ref: "CIC-MMF-SEP-2026"
    },
    {
      dateStr: "2026-10-31",
      channel: "CIC MMF",
      opening: 925992.07,
      purchases: 45000.00,
      interest: 6555.40,
      wht: 983.31,
      netYield: 5572.09,
      withdrawals: 0,
      closing: 976564.16,
      ref: "CIC-MMF-OCT-2026"
    }
  ];

  const fullFundRows = backfillFundRows.concat(postJulyRows);

  fundSheet.clear();
  fundSheet.getRange(1, 1, 1, fundHeaders.length).setValues([fundHeaders]);
  fundSheet.getRange(1, 1, 1, fundHeaders.length).setFontWeight("bold").setBackground("#1b4332").setFontColor("#ffffff");
  fundSheet.setFrozenRows(1);

  const matrix = fullFundRows.map(function(r) {
    return [
      r.dateStr,
      r.channel,
      r.opening,
      r.purchases,
      r.interest,
      r.wht,
      r.netYield,
      r.withdrawals,
      r.closing,
      r.ref
    ];
  });

  if (matrix.length > 0) {
    fundSheet.getRange(2, 1, matrix.length, fundHeaders.length).setValues(matrix);
    results.fundStatementsAdded = matrix.length;
  }

  // 3. Update 'Accounts' sheet for CIC MMF
  const accSheet = ss.getSheetByName(SHEETS.ACCOUNTS);
  if (accSheet && accSheet.getLastRow() > 1) {
    const accData = accSheet.getDataRange().getValues();
    const colMap = getHeaderMap_(accData[0]);

    for (let r = 1; r < accData.length; r++) {
      const orgName = String(accData[r][colMap["Org. Name"]] || "").trim();
      const accNum = String(accData[r][colMap["Acc. Number"]] || "").trim();

      if (orgName.indexOf("CIC") !== -1 || accNum.indexOf("47379") !== -1) {
        if (colMap["Acc. Number"] !== undefined) {
          accSheet.getRange(r + 1, colMap["Acc. Number"] + 1).setValue(CIC_MMF_ACCOUNT_NUMBER);
        }
        if (colMap["Statement Balance"] !== undefined) {
          accSheet.getRange(r + 1, colMap["Statement Balance"] + 1).setValue(976564.16);
        }
        if (colMap["Balance Date"] !== undefined) {
          accSheet.getRange(r + 1, colMap["Balance Date"] + 1).setValue("2026-10-31");
        }
        if (colMap["Reconciliation Status"] !== undefined) {
          accSheet.getRange(r + 1, colMap["Reconciliation Status"] + 1).setValue("Balanced");
        }
        results.accountsUpdated = true;
        break;
      }
    }
  }

  return results;
}
