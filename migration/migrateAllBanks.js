// migration/migrateAllBanks.js
import mongoose from 'mongoose';
import Bank from '../src/models/Banks.js';;

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

// Complete banks data from your legacy system
const legacyBanksData = [
  { id: 876, name: 'Mutual Trust Microfinance Bank', code: '090151', long_code: '090151', last_updated: '2024-05-09 20:36:35' },
  { id: 883, name: 'Nargata MFB', code: '090152', long_code: '090152', last_updated: '2024-05-09 20:36:35' },
  { id: 890, name: 'Navy Microfinance bank', code: '090263', long_code: '090263', last_updated: '2024-05-09 20:36:35' },
  { id: 897, name: 'Ndiorah Microfinance Bank', code: '090128', long_code: '090128', last_updated: '2024-05-09 20:36:35' },
  { id: 904, name: 'Neptune Microfinance Bank', code: '090329', long_code: '090329', last_updated: '2024-05-09 20:36:35' },
  { id: 911, name: 'NEW DAWN MICROFINANCE BANK', code: '090205', long_code: '090205', last_updated: '2024-05-09 20:36:35' },
  { id: 918, name: 'NEW GOLDEN PASTURES MICROFINANCE BANK', code: '090378', long_code: '090378', last_updated: '2024-05-09 20:36:35' },
  { id: 925, name: 'New Prudential Bank', code: '561', long_code: '090108', last_updated: '2024-05-09 20:36:35' },
  { id: 932, name: 'Nice Microfinance Bank', code: '090459', long_code: '090459', last_updated: '2024-05-09 20:36:35' },
  { id: 939, name: 'NIRSAL National microfinance bank', code: '090194', long_code: '090194', last_updated: '2024-05-09 20:36:35' },
  { id: 946, name: 'Nnew women MFB', code: '090283', long_code: '090283', last_updated: '2024-05-09 20:36:35' },
  { id: 953, name: 'Nova Merchant Bank', code: '637', long_code: '060003', last_updated: '2024-05-09 20:36:35' },
  { id: 960, name: 'NPF MicroFinance Bank', code: '070001', long_code: '070001', last_updated: '2024-05-09 20:36:35' },
  { id: 967, name: 'NUTURE MFB', code: '090364', long_code: '090364', last_updated: '2024-05-09 20:36:35' },
  { id: 974, name: 'Nwannegadi MFB', code: '090399', long_code: '090399', last_updated: '2024-05-09 20:36:35' },
  { id: 981, name: 'Oakland Microfinance Bank', code: '090437', long_code: '090437', last_updated: '2024-05-09 20:36:35' },
  { id: 988, name: 'Oche Microfinance Bank', code: '090333', long_code: '090333', last_updated: '2024-05-09 20:36:35' },
  { id: 995, name: 'Ohafia Microfinance Bank', code: '090119', long_code: '090119', last_updated: '2024-05-09 20:36:35' },
  { id: 1002, name: 'OKPOGA MICROFINANCE BANK', code: '090161', long_code: '090161', last_updated: '2024-05-09 20:36:35' },
  { id: 1009, name: 'OLABISI ONABANJO UNIVERSITY MICROFINANCE BANK', code: '090272', long_code: '090272', last_updated: '2024-05-09 20:36:35' },
  { id: 1016, name: 'OLOFIN OWENA Microfinance Bank', code: '090468', long_code: '090468', last_updated: '2024-05-09 20:36:35' },
  { id: 1023, name: 'Olowolagba Microfinance Bank', code: '090404', long_code: '090404', last_updated: '2024-05-09 20:36:35' },
  { id: 1030, name: 'OLUCHUKWU Microfinance Bank', code: '090471', long_code: '090471', last_updated: '2024-05-09 20:36:35' },
  { id: 1037, name: 'Omiye MFB', code: '090295', long_code: '090295', last_updated: '2024-05-09 20:36:35' },
  { id: 1044, name: 'ORITA-BASORUN Microfinance Bank', code: '090460', long_code: '090460', last_updated: '2024-05-09 20:36:35' },
  { id: 1051, name: 'Oscotech MFB', code: '090396', long_code: '090396', last_updated: '2024-05-09 20:36:35' },
  { id: 1058, name: 'Ospoly Microfinance Bank', code: '090456', long_code: '090456', last_updated: '2024-05-09 20:36:35' },
  { id: 1065, name: 'Paga', code: '100002', long_code: '100002', last_updated: '2024-05-09 20:36:35' },
  { id: 1072, name: 'Page Microfinance Bank', code: '070008', long_code: '070008', last_updated: '2024-05-09 20:36:35' },
  { id: 1079, name: 'Palmpay', code: '100033', long_code: '100033', last_updated: '2024-05-09 20:36:35' },
  { id: 1086, name: 'PARALLEX BANK', code: '000030', long_code: '000030', last_updated: '2024-05-09 20:36:35' },
  { id: 1093, name: 'PARKWAY MICROFINANCE BANK', code: '090390', long_code: '090390', last_updated: '2024-05-09 20:36:35' },
  { id: 1100, name: 'Parkway-ReadyCash', code: '100003', long_code: '100003', last_updated: '2024-05-09 20:36:35' },
  { id: 1107, name: 'Patrick Gold', code: '090317', long_code: '090317', last_updated: '2024-05-09 20:36:35' },
  { id: 1114, name: 'PayAttitude Online', code: '110001', long_code: '110001', last_updated: '2024-05-09 20:36:35' },
  { id: 1121, name: 'Paycom(opay)', code: '100004', long_code: '100004', last_updated: '2024-05-09 20:36:35' },
  { id: 1128, name: 'Peace Microfinance Bank', code: '090402', long_code: '090402', last_updated: '2024-05-09 20:36:35' },
  { id: 1135, name: 'PecanTrust Microfinance Bank', code: '090137', long_code: '090137', last_updated: '2024-05-09 20:36:35' },
  { id: 1142, name: 'Pennywise Microfinance bank', code: '090196', long_code: '090196', last_updated: '2024-05-09 20:36:35' },
  { id: 1149, name: 'Personal Trust Microfinance Bank', code: '090135', long_code: '090135', last_updated: '2024-05-09 20:36:35' },
  { id: 1156, name: 'PETRA MICROFINANCE BANK', code: '090165', long_code: '090165', last_updated: '2024-05-09 20:36:35' },
  { id: 1163, name: 'Pillar MFB', code: '090289', long_code: '090289', last_updated: '2024-05-09 20:36:35' },
  { id: 1170, name: 'Platinum Mortgage Bank Ltd', code: '070013', long_code: '070013', last_updated: '2024-05-09 20:36:35' },
  { id: 1177, name: 'Polaris Bank', code: '076', long_code: '000008', last_updated: '2024-05-09 20:36:35' },
  { id: 1184, name: 'Polyuwanna MFB', code: '090296', long_code: '090296', last_updated: '2024-05-09 20:36:35' },
  { id: 1191, name: 'Preeminent Microfinance Bank', code: '090412', long_code: '090412', last_updated: '2024-05-09 20:36:35' },
  { id: 1198, name: 'Prestige Microfinance Bank', code: '090274', long_code: '090274', last_updated: '2024-05-09 20:36:35' },
  { id: 1205, name: 'PRISCO MICROFINANCE BANK', code: '090481', long_code: '090481', last_updated: '2024-05-09 20:36:35' },
  { id: 1212, name: 'Providus Bank', code: '101', long_code: '000023', last_updated: '2024-05-09 20:36:35' },
  { id: 1219, name: 'Purplemoney MFB', code: '090303', long_code: '090303', last_updated: '2024-05-09 20:36:35' },
  { id: 1226, name: 'QUICKFUND MICROFINANCE BANK', code: '090261', long_code: '090261', last_updated: '2024-05-09 20:36:35' },
  { id: 1233, name: 'RAHAMA MICROFINANCE BANK', code: '090170', long_code: '090170', last_updated: '2024-05-09 20:36:35' },
  { id: 1240, name: 'Rand Merchant Bank', code: '502', long_code: '000024', last_updated: '2024-05-09 20:36:35' },
  { id: 1247, name: 'Refuge Mortgage Bank', code: '070011', long_code: '070011', last_updated: '2024-05-09 20:36:35' },
  { id: 1254, name: 'Regent Microfinance Bank', code: '090125', long_code: '090125', last_updated: '2024-05-09 20:36:35' },
  { id: 1261, name: 'Rehoboth Microfinance Bank', code: '090463', long_code: '090463', last_updated: '2024-05-09 20:36:35' },
  { id: 1268, name: 'RELIANCE MICROFINANCE BANK', code: '090173', long_code: '090173', last_updated: '2024-05-09 20:36:35' },
  { id: 1275, name: 'RENMONEY MICROFINANCE BANK', code: '090198', long_code: '090198', last_updated: '2024-05-09 20:36:35' },
  { id: 1282, name: 'Rephidim Microfinance Bank', code: '090322', long_code: '090322', last_updated: '2024-05-09 20:36:35' },
  { id: 1289, name: 'Richway Microfinance Bank', code: '090132', long_code: '090132', last_updated: '2024-05-09 20:36:35' },
  { id: 1296, name: 'RIGO Microfinance Bank', code: '090433', long_code: '090433', last_updated: '2024-05-09 20:36:35' },
  { id: 1303, name: 'RIMA Microfinance Bank', code: '090443', long_code: '090443', last_updated: '2024-05-09 20:36:35' },
  { id: 1310, name: 'Royal Exchange Microfinance Bank', code: '090138', long_code: '090138', last_updated: '2024-05-09 20:36:35' },
  { id: 1317, name: 'RUBIES MFB', code: '090175', long_code: '090175', last_updated: '2024-05-09 20:36:35' },
  { id: 1324, name: 'Safe Haven MFB', code: '090286', long_code: '090286', last_updated: '2024-05-09 20:36:35' },
  { id: 1331, name: 'Safegate Microfinance Bank', code: '090485', long_code: '090485', last_updated: '2024-05-09 20:36:35' },
  { id: 1338, name: 'SafeTrust', code: '090006', long_code: '090006', last_updated: '2024-05-09 20:36:35' },
  { id: 1345, name: 'Sagamu Microfinance Bank', code: '090140', long_code: '090140', last_updated: '2024-05-09 20:36:35' },
  { id: 1352, name: 'Seed Capital Microfinance Bank', code: '090112', long_code: '090112', last_updated: '2024-05-09 20:36:35' },
  { id: 1359, name: 'SEEDVEST MICROFINANCE BANK', code: '090369', long_code: '090369', last_updated: '2024-05-09 20:36:35' },
  { id: 1366, name: 'Shepherd Trust Microfinance Bank', code: '090401', long_code: '090401', last_updated: '2024-05-09 20:36:35' },
  { id: 1373, name: 'SLS  MF Bank', code: '090449', long_code: '090449', last_updated: '2024-05-09 20:36:35' },
  { id: 1380, name: 'SPARKLE MICROFINANCE BANK', code: '090325', long_code: '090325', last_updated: '2024-05-09 20:36:35' },
  { id: 1387, name: 'Spectrum Microfinance Bank', code: '090436', long_code: '090436', last_updated: '2024-05-09 20:36:35' },
  { id: 1394, name: 'Stanbic IBTC @ease wallet', code: '100007', long_code: '100007', last_updated: '2024-05-09 20:36:35' },
  { id: 1401, name: 'StanbicIBTC Bank', code: '221', long_code: '000012', last_updated: '2024-05-09 20:36:35' },
  { id: 1408, name: 'Standard MFB', code: '090182', long_code: '090182', last_updated: '2024-05-09 20:36:35' },
  { id: 1415, name: 'StandardChartered', code: '068', long_code: '000021', last_updated: '2024-05-09 20:36:35' },
  { id: 1422, name: 'Stanford MFB', code: '090162', long_code: '090162', last_updated: '2024-05-09 20:36:35' },
  { id: 1429, name: 'STB Mortgage Bank', code: '070022', long_code: '070022', last_updated: '2024-05-09 20:36:35' },
  { id: 1436, name: 'Stellas Microfinance bank', code: '090262', long_code: '090262', last_updated: '2024-05-09 20:36:35' },
  { id: 1443, name: 'Sterling Bank', code: '232', long_code: '000001', last_updated: '2024-05-09 20:36:35' },
  { id: 1450, name: 'Stockcorp  Microfinance Bank', code: '090340', long_code: '090340', last_updated: '2024-05-09 20:36:35' },
  { id: 1457, name: 'Sulsap MFB', code: '090305', long_code: '090305', last_updated: '2024-05-09 20:36:35' },
  { id: 1464, name: 'Sunbeam Microfinance Bank', code: '090302', long_code: '090302', last_updated: '2024-05-09 20:36:35' },
  { id: 1471, name: 'Suntrust Bank', code: '000022', long_code: '000022', last_updated: '2024-05-09 20:36:35' },
  { id: 1478, name: 'Support MF Bank', code: '090446', long_code: '090446', last_updated: '2024-05-09 20:36:35' },
  { id: 1485, name: 'TagPay', code: '100023', long_code: '100023', last_updated: '2024-05-09 20:36:35' },
  { id: 1492, name: 'Taj Bank', code: '000026', long_code: '000026', last_updated: '2024-05-09 20:36:35' },
  { id: 1499, name: 'TANGERINE MONEY', code: '090426', long_code: '090426', last_updated: '2024-05-09 20:36:35' },
  { id: 1506, name: 'TCF Microfinance Bank', code: '090115', long_code: '090115', last_updated: '2024-05-09 20:36:35' },
  { id: 1513, name: 'TeasyMobile', code: '100010', long_code: '100010', last_updated: '2024-05-09 20:36:35' },
  { id: 1520, name: 'THINK FINANCE MICROFINANCE BANK', code: '090373', long_code: '090373', last_updated: '2024-05-09 20:36:35' },
  { id: 1527, name: 'Titan Trust Bank', code: '000025', long_code: '000025', last_updated: '2024-05-09 20:36:35' },
  { id: 1534, name: 'Trident Microfinance Bank', code: '090146', long_code: '090146', last_updated: '2024-05-09 20:36:35' },
  { id: 1541, name: 'Trust Banc Microfinance Bank', code: '090123', long_code: '090123', last_updated: '2024-05-09 20:36:35' },
  { id: 1548, name: 'Trust Microfinance Bank', code: '090327', long_code: '090327', last_updated: '2024-05-09 20:36:35' },
  { id: 1555, name: 'U AND C MFB', code: '090315', long_code: '090315', last_updated: '2024-05-09 20:36:35' },
  { id: 1562, name: 'UNAAB MFB', code: '090331', long_code: '090331', last_updated: '2024-05-09 20:36:35' },
  { id: 1569, name: 'Uniben Microfinance bank', code: '090266', long_code: '090266', last_updated: '2024-05-09 20:36:35' },
  { id: 1576, name: 'UNIIBADAN Microfinance Bank', code: '090461', long_code: '090461', last_updated: '2024-05-09 20:36:35' },
  { id: 1583, name: 'UNILAG MICROFINANCE BANK', code: '090452', long_code: '090452', last_updated: '2024-05-09 20:36:35' },
  { id: 1590, name: 'unilorin Microfinance Bank', code: '090341', long_code: '090341', last_updated: '2024-05-09 20:36:35' },
  { id: 1597, name: 'Unimaid Microfinance Bank', code: '090464', long_code: '090464', last_updated: '2024-05-09 20:36:35' },
  { id: 1604, name: 'Union Bank', code: '032', long_code: '000018', last_updated: '2024-05-09 20:36:35' },
  { id: 1611, name: 'United Bank for Africa', code: '033', long_code: '000004', last_updated: '2024-05-09 20:36:35' },
  { id: 1618, name: 'Unity Bank', code: '215', long_code: '000011', last_updated: '2024-05-09 20:36:35' },
  { id: 1625, name: 'UniUyo Microfinance Bank', code: '090338', long_code: '090338', last_updated: '2024-05-09 20:36:35' },
  { id: 1632, name: 'UNN MICROFINANCE BANK', code: '090251', long_code: '090251', last_updated: '2024-05-09 20:36:35' },
  { id: 1639, name: 'Uzondu MF Bank', code: '090453', long_code: '090453', last_updated: '2024-05-09 20:36:35' },
  { id: 1646, name: 'Verdant Microfinance Bank', code: '090474', long_code: '090474', last_updated: '2024-05-09 20:36:35' },
  { id: 1653, name: 'VFD Microfinance Bank', code: '566', long_code: '090110', last_updated: '2024-05-09 20:36:35' },
  { id: 1660, name: 'Visa Microfinance Bank', code: '090139', long_code: '090139', last_updated: '2024-05-09 20:36:35' },
  { id: 1667, name: 'VTNetworks', code: '100012', long_code: '100012', last_updated: '2024-05-09 20:36:35' },
  { id: 1674, name: 'Wema/ALAT', code: '035', long_code: '000017', last_updated: '2024-05-09 20:36:35' },
  { id: 1681, name: 'Wetland Microfinance Bank', code: '090120', long_code: '090120', last_updated: '2024-05-09 20:36:35' },
  { id: 1688, name: 'Winview Microfinance Bank', code: '090419', long_code: '090419', last_updated: '2024-05-09 20:36:35' },
  { id: 1695, name: 'Xslnce Microfinance Bank', code: '090124', long_code: '090124', last_updated: '2024-05-09 20:36:35' },
  { id: 1702, name: 'YCT Microfinance Bank', code: '090466', long_code: '090466', last_updated: '2024-05-09 20:36:35' },
  { id: 1709, name: 'Yes Microfinance Bank', code: '090142', long_code: '090142', last_updated: '2024-05-09 20:36:35' },
  { id: 1716, name: 'Yobe MFB', code: '090252', long_code: '090252', last_updated: '2024-05-09 20:36:35' },
  { id: 1723, name: 'Zenith Bank', code: '057', long_code: '000015', last_updated: '2024-05-09 20:36:36' },
  { id: 1730, name: 'ZenithMobile', code: '100018', long_code: '100018', last_updated: '2024-05-09 20:36:36' },
  { id: 1737, name: 'ZWallet', code: '100034', long_code: '100034', last_updated: '2024-05-09 20:36:36' },
  { id: 1744, name: 'UNICAL MICROFINANCE BANK', code: '090193', long_code: '090193', last_updated: '2024-05-09 20:36:36' },
  { id: 1758, name: 'Aella Microfinance Bank', code: '090614', long_code: '090614', last_updated: '2024-05-09 20:36:36' },
  { id: 1765, name: 'Amucha Microfinance Bank', code: '090645', long_code: '090645', last_updated: '2024-05-09 20:36:36' },
  { id: 1772, name: 'Goldman Microfinance Bank', code: '090574', long_code: '090574', last_updated: '2024-05-09 20:36:36' },
  { id: 1779, name: 'Halo Microfinance Bank', code: '090539', long_code: '090539', last_updated: '2024-05-09 20:36:36' },
  { id: 1786, name: 'Kuda Microfinance bank', code: '090267', long_code: '090267', last_updated: '2024-05-09 20:36:36' },
  { id: 1793, name: 'KWASU MICROFINANCE BANK', code: '090450', long_code: '090450', last_updated: '2024-05-09 20:36:36' },
  { id: 1800, name: 'LA FAYETTE MICROFINANCE BANK', code: '090155', long_code: '090155', last_updated: '2024-05-09 20:36:36' },
  { id: 1807, name: 'Lagos Building Investment Company', code: '070012', long_code: '070012', last_updated: '2024-05-09 20:36:36' },
  { id: 1814, name: 'Landgold  Microfinance Bank', code: '090422', long_code: '090422', last_updated: '2024-05-09 20:36:36' },
  { id: 1821, name: 'LAPO MICROFINANCE BANK', code: '090177', long_code: '090177', last_updated: '2024-05-09 20:36:36' },
  { id: 1828, name: 'Lavender Microfinance bank', code: '090271', long_code: '090271', last_updated: '2024-05-09 20:36:36' },
  { id: 1835, name: 'Legend Microfinance Bank', code: '090372', long_code: '090372', last_updated: '2024-05-09 20:36:36' },
  { id: 1842, name: 'Letshego Microfinance Bank', code: '090420', long_code: '090420', last_updated: '2024-05-09 20:36:36' },
  { id: 1849, name: 'LIGHT MICROFINANCE BANK', code: '090477', long_code: '090477', last_updated: '2024-05-09 20:36:36' },
  { id: 1856, name: 'LINKS MICROFINANCE BANK', code: '090435', long_code: '090435', last_updated: '2024-05-09 20:36:36' },
  { id: 1863, name: 'LIVINGTRUST MORTGAGE BANK', code: '070007', long_code: '070007', last_updated: '2024-05-09 20:36:36' },
  { id: 1870, name: 'LOTUS BANK', code: '000029', long_code: '000029', last_updated: '2024-05-09 20:36:36' },
  { id: 1877, name: 'Lovonus Microfinance bank', code: '090265', long_code: '090265', last_updated: '2024-05-09 20:36:36' },
  { id: 1884, name: 'M36', code: '100035', long_code: '100035', last_updated: '2024-05-09 20:36:36' },
  { id: 1891, name: 'Mainland MICROFINANCE BANK', code: '090323', long_code: '090323', last_updated: '2024-05-09 20:36:36' },
  { id: 1898, name: 'Mainstreet Microfinance Bank', code: '090171', long_code: '090171', last_updated: '2024-05-09 20:36:36' },
  { id: 1905, name: 'Maintrust MFB', code: '090465', long_code: '090465', last_updated: '2024-05-09 20:36:36' },
  { id: 1912, name: 'MALACHY MICROFINANCE BANK', code: '090174', long_code: '090174', last_updated: '2024-05-09 20:36:36' },
  { id: 1919, name: 'MANNY MICROFINANCE BANK', code: '090383', long_code: '090383', last_updated: '2024-05-09 20:36:36' },
  { id: 1926, name: 'Maritime Microfinance Bank', code: '090410', long_code: '090410', last_updated: '2024-05-09 20:36:36' },
  { id: 1933, name: 'Mautech  Microfinance Bank', code: '090423', long_code: '090423', last_updated: '2024-05-09 20:36:36' },
  { id: 1940, name: 'Mayfair  MFB', code: '090321', long_code: '090321', last_updated: '2024-05-09 20:36:36' },
  { id: 1947, name: 'MayFresh Mortgage Bank', code: '070019', long_code: '070019', last_updated: '2024-05-09 20:36:36' },
  { id: 1954, name: 'Megapraise Microfinance Bank', code: '090280', long_code: '090280', last_updated: '2024-05-09 20:36:36' },
  { id: 1961, name: 'Memphis Microfinance Bank', code: '090432', long_code: '090432', last_updated: '2024-05-09 20:36:36' },
  { id: 1968, name: 'Microvis Microfinance Bank', code: '090113', long_code: '090113', last_updated: '2024-05-09 20:36:36' },
  { id: 1975, name: 'MIDLAND MICROFINANCE BANK', code: '090192', long_code: '090192', last_updated: '2024-05-09 20:36:36' },
  { id: 1982, name: 'miMONEY (powered by IntelliFin)', code: '100027', long_code: '100027', last_updated: '2024-05-09 20:36:36' },
  { id: 1989, name: 'MINT-FINEX MFB', code: '090281', long_code: '090281', last_updated: '2024-05-09 20:36:36' },
  { id: 1996, name: 'Mkudi', code: '100011', long_code: '100011', last_updated: '2024-05-09 20:36:36' },
  { id: 2003, name: 'MOLUSI MICROFINANCE BANK', code: '090362', long_code: '090362', last_updated: '2024-05-09 20:36:36' },
  { id: 2010, name: 'Monarch Microfinance Bank', code: '090462', long_code: '090462', last_updated: '2024-05-09 20:36:36' },
  { id: 2017, name: 'MoneyBox', code: '100020', long_code: '100020', last_updated: '2024-05-09 20:36:36' },
  { id: 2024, name: 'Moneytrust microfinance bank Ltd', code: '090129', long_code: '090129', last_updated: '2024-05-09 20:36:36' },
  { id: 2031, name: 'Moyofade MF Bank', code: '090448', long_code: '090448', last_updated: '2024-05-09 20:36:36' },
  { id: 2038, name: 'Mozfin Microfinance Bank', code: '090392', long_code: '090392', last_updated: '2024-05-09 20:36:36' },
  { id: 2045, name: 'MUTUAL BENEFITS MICROFINANCE BANK', code: '090190', long_code: '090190', last_updated: '2024-05-09 20:36:36' },
  { id: 2052, name: 'Goodnews Microfinance Bank', code: '090495', long_code: '090495', last_updated: '2024-05-09 20:36:36' },
  { id: 2059, name: 'FairMoney Microfinance Bank', code: '090551', long_code: '090551', last_updated: '2024-05-09 20:36:36' },
  { id: 2066, name: 'PAYSTACK-TITAN', code: '100039', long_code: '100039', last_updated: '2024-05-09 20:36:36' },
  { id: 2073, name: 'MoMo PSB', code: '120003', long_code: '120003', last_updated: '2024-05-09 20:36:36' },
  { id: 2080, name: 'SmartCash', code: '120004', long_code: '120004', last_updated: '2024-05-09 20:36:36' },
  { id: 2087, name: 'Premium Trust Bank', code: '000031', long_code: '000031', last_updated: '2024-05-09 20:36:36' },
  { id: 2094, name: 'eNaira', code: '000033', long_code: '000033', last_updated: '2024-05-09 20:36:36' },
  { id: 2101, name: 'Signature Bank', code: '000034', long_code: '000034', last_updated: '2024-05-09 20:36:36' },
  { id: 2108, name: 'Optimus Bank', code: '000036', long_code: '000036', last_updated: '2024-05-09 20:36:36' },
  { id: 2115, name: 'Bellbank Microfinance Bank', code: '090672', long_code: '090672', last_updated: '2024-05-09 20:36:36' },
  { id: 2122, name: 'Nuggets MFB', code: '090676', long_code: '090676', last_updated: '2024-05-09 20:36:36' },
  { id: 2129, name: 'Wesley MFB', code: '090699', long_code: '090699', last_updated: '2024-05-09 20:36:36' },
  { id: 2136, name: 'Olive MFB', code: '090696', long_code: '090696', last_updated: '2024-05-09 20:36:36' },
  { id: 2143, name: 'WRA MFB', code: '090631', long_code: '090631', last_updated: '2024-05-09 20:36:36' },
  { id: 2150, name: 'Garun Mallam MFB', code: '090691', long_code: '090691', last_updated: '2024-05-09 20:36:36' },
  { id: 2157, name: 'ADA MFB', code: '090483', long_code: '090483', last_updated: '2024-05-09 20:36:36' },
  { id: 2164, name: 'Aniocha MFB', code: '090469', long_code: '090469', last_updated: '2024-05-09 20:36:36' },
  { id: 2171, name: 'Avuenegbe MFB', code: '090478', long_code: '090478', last_updated: '2024-05-09 20:36:36' },
  { id: 2178, name: 'CINTRUST MFB', code: '090480', long_code: '090480', last_updated: '2024-05-09 20:36:36' },
  { id: 2185, name: 'Citizen Trust Microfinance Bank Ltd', code: '090343', long_code: '090343', last_updated: '2024-05-09 20:36:36' },
  { id: 2192, name: 'First Heritage MFB', code: '090479', long_code: '090479', last_updated: '2024-05-09 20:36:36' },
  { id: 2199, name: 'Fotress Microfinance Bank', code: '090486', long_code: '090486', last_updated: '2024-05-09 20:36:36' },
  { id: 2206, name: 'GARKI MFB', code: '090484', long_code: '090484', last_updated: '2024-05-09 20:36:36' },
  { id: 2213, name: 'Moniepoint Microfinance Bank', code: '090405', long_code: '090405', last_updated: '2024-05-09 20:36:36' },
  { id: 2220, name: 'Waya Microfinance Bank', code: '090590', long_code: '090590', last_updated: '2024-05-09 20:36:36' },
  { id: 2227, name: 'Virtue Microfinance Bank', code: '090150', long_code: '090150', last_updated: '2024-05-09 20:36:36' },
  { id: 2234, name: '9 payment service Bank', code: '120001', long_code: '120001', last_updated: '2024-05-09 20:36:36' },
  { id: 2241, name: 'AB Microfinance bank', code: '090270', long_code: '090270', last_updated: '2024-05-09 20:36:36' },
  { id: 2248, name: 'Abbey Mortgage Bank', code: '070010', long_code: '070010', last_updated: '2024-05-09 20:36:36' },
  { id: 2255, name: 'Above Only Microfinance bank', code: '090260', long_code: '090260', last_updated: '2024-05-09 20:36:36' },
  { id: 2262, name: 'ABU Microfinance bank', code: '090197', long_code: '090197', last_updated: '2024-05-09 20:36:36' },
  { id: 2269, name: 'Abucoop Microfinance Bank', code: '090424', long_code: '090424', last_updated: '2024-05-09 20:36:36' },
  { id: 2276, name: 'Access Bank', code: '044', long_code: '000014', last_updated: '2024-05-09 20:36:36' },
  { id: 2283, name: 'ACCESS BANK PLC (DIAMOND)', code: '063', long_code: '000005', last_updated: '2024-05-09 20:36:36' },
  { id: 2290, name: 'ACCESS YELLO BETA', code: '100052', long_code: '100052', last_updated: '2024-05-09 20:36:36' },
  { id: 2297, name: 'AccessMoney', code: '100013', long_code: '100013', last_updated: '2024-05-09 20:36:36' },
  { id: 2304, name: 'Accion Microfinance Bank', code: '90134', long_code: '090134', last_updated: '2024-05-09 20:36:36' },
  { id: 2311, name: 'ADDOSSER MICROFINANCE BANK', code: '090160', long_code: '090160', last_updated: '2024-05-09 20:36:36' },
  { id: 2318, name: 'Adeyemi College Staff Microfinance bank', code: '090268', long_code: '090268', last_updated: '2024-05-09 20:36:36' },
  { id: 2325, name: 'Afekhafe MFB', code: '090292', long_code: '090292', last_updated: '2024-05-09 20:36:36' },
  { id: 2332, name: 'AG Mortgage Bank', code: '100028', long_code: '100028', last_updated: '2024-05-09 20:36:36' },
  { id: 2339, name: 'AGOSASA MICROFINANCE BANK', code: '090371', long_code: '090371', last_updated: '2024-05-09 20:36:36' },
  { id: 2346, name: 'AL-Barakah Microfinance Bank', code: '090133', long_code: '090133', last_updated: '2024-05-09 20:36:36' },
  { id: 2353, name: 'Alekun Microfinance bank', code: '090259', long_code: '090259', last_updated: '2024-05-09 20:36:36' },
  { id: 2360, name: 'Alert MFB', code: '090297', long_code: '090297', last_updated: '2024-05-09 20:36:36' },
  { id: 2367, name: 'Alhayat MFB', code: '090277', long_code: '090277', last_updated: '2024-05-09 20:36:36' },
  { id: 2374, name: 'Allworkers Microfinance Bank', code: '090131', long_code: '090131', last_updated: '2024-05-09 20:36:36' },
  { id: 2381, name: 'ALPHA KAPITAL MICROFINANCE BANK', code: '090169', long_code: '090169', last_updated: '2024-05-09 20:36:36' },
  { id: 2388, name: 'Amac Microfinance Bank', code: '090394', long_code: '090394', last_updated: '2024-05-09 20:36:36' },
  { id: 2395, name: 'AMJU UNIQUE MICROFINANCE BANK', code: '090180', long_code: '090180', last_updated: '2024-05-09 20:36:36' },
  { id: 2402, name: 'AMML Microfinance Bank', code: '090116', long_code: '090116', last_updated: '2024-05-09 20:36:36' },
  { id: 2409, name: 'Apeks Microfinance Bank', code: '090143', long_code: '090143', last_updated: '2024-05-09 20:36:36' },
  { id: 2416, name: 'APPLE  MICROFINANCE BANK', code: '090376', long_code: '090376', last_updated: '2024-05-09 20:36:36' },
  { id: 2423, name: 'Arise MFB', code: '090282', long_code: '090282', last_updated: '2024-05-09 20:36:36' },
  { id: 2430, name: 'ASOSavings And Loans', code: '090001', long_code: '090001', last_updated: '2024-05-09 20:36:36' },
  { id: 2437, name: 'Asset Matrix Microfinance Bank', code: '090287', long_code: '090287', last_updated: '2024-05-09 20:36:36' },
  { id: 2444, name: 'ASSETS Microfinance Bank', code: '090473', long_code: '090473', last_updated: '2024-05-09 20:36:36' },
  { id: 2451, name: 'Astrapolis MFB', code: '090172', long_code: '090172', last_updated: '2024-05-09 20:36:36' },
  { id: 2458, name: 'ATBU Microfinance Bank', code: '090451', long_code: '090451', last_updated: '2024-05-09 20:36:36' },
  { id: 2465, name: 'Auchi Microfinance bank', code: '090264', long_code: '090264', last_updated: '2024-05-09 20:36:36' },
  { id: 2472, name: 'Baines Credit MFB', code: '090188', long_code: '090188', last_updated: '2024-05-09 20:36:36' },
  { id: 2479, name: 'Balogun Fulani  Microfinance Bank', code: '090181', long_code: '090181', last_updated: '2024-05-09 20:36:36' },
  { id: 2486, name: 'Balogun Gambari MFB', code: '090326', long_code: '090326', last_updated: '2024-05-09 20:36:36' },
  { id: 2493, name: 'Banex MFB', code: '090425', long_code: '090425', last_updated: '2024-05-09 20:36:36' },
  { id: 2500, name: 'Baobab Microfinance Bank', code: '090136', long_code: '090136', last_updated: '2024-05-09 20:36:36' },
  { id: 2507, name: 'Bayero MICROFINANCE BANK', code: '090316', long_code: '090316', last_updated: '2024-05-09 20:36:36' },
  { id: 2514, name: 'BC Kash Microfinance Bank', code: '090127', long_code: '090127', last_updated: '2024-05-09 20:36:36' },
  { id: 2521, name: 'Benysta Microfinance Bank', code: '090413', long_code: '090413', last_updated: '2024-05-09 20:36:36' },
  { id: 2528, name: 'BIPC', code: '090336', long_code: '090336', last_updated: '2024-05-09 20:36:36' },
  { id: 2535, name: 'Bluewhales Microfinance Bank', code: '090431', long_code: '090431', last_updated: '2024-05-09 20:36:36' },
  { id: 2542, name: 'Boctrust Microfinance Bank', code: '090117', long_code: '090117', last_updated: '2024-05-09 20:36:36' },
  { id: 2549, name: 'Bonghe Microfinance Bank', code: '090319', long_code: '090319', last_updated: '2024-05-09 20:36:36' },
  { id: 2556, name: 'BORGU MICROFINANCE BANK', code: '090395', long_code: '090395', last_updated: '2024-05-09 20:36:36' },
  { id: 2563, name: 'Borstal Microfinance Bank', code: '090454', long_code: '090454', last_updated: '2024-05-09 20:36:36' },
  { id: 2570, name: 'Bosak MFB', code: '090176', long_code: '090176', last_updated: '2024-05-09 20:36:36' },
  { id: 2577, name: 'Bowen Microfinance Bank', code: '090148', long_code: '090148', last_updated: '2024-05-09 20:36:36' },
  { id: 2584, name: 'BRENT MORTGAGE BANK', code: '070015', long_code: '070015', last_updated: '2024-05-09 20:36:36' },
  { id: 2591, name: 'BRETHREN MICROFINANCE BANK', code: '090293', long_code: '090293', last_updated: '2024-05-09 20:36:36' },
  { id: 2598, name: 'BRIDGEWAY MICROFINANCE BANK', code: '090393', long_code: '090393', last_updated: '2024-05-09 20:36:36' },
  { id: 2605, name: 'Brightway MFB', code: '090308', long_code: '090308', last_updated: '2024-05-09 20:36:36' },
  { id: 2612, name: 'Business Support Microfinance Bank', code: '090406', long_code: '090406', last_updated: '2024-05-09 20:36:36' },
  { id: 2619, name: 'Calabar Microfinance Bank', code: '090415', long_code: '090415', last_updated: '2024-05-09 20:36:36' },
  { id: 2626, name: 'Capstone MF Bank', code: '090445', long_code: '090445', last_updated: '2024-05-09 20:36:36' },
  { id: 2633, name: 'CARBON MICROFINANCE BANK', code: '100026', long_code: '100026', last_updated: '2024-05-09 20:36:36' },
  { id: 2640, name: 'CARETAKER Microfinance Bank', code: '090472', long_code: '090472', last_updated: '2024-05-09 20:36:36' },
  { id: 2647, name: 'CASHCONNCECT MFB', code: '090360', long_code: '090360', last_updated: '2024-05-09 20:36:36' },
  { id: 2654, name: 'Cellulant PSSP', code: '110012', long_code: '110012', last_updated: '2024-05-09 20:36:36' },
  { id: 2661, name: 'CEMCS Microfinance Bank', code: '090154', long_code: '090154', last_updated: '2024-05-09 20:36:36' },
  { id: 2668, name: 'Central Bank of Nigeria', code: '000028', long_code: '000028', last_updated: '2024-05-09 20:36:36' },
  { id: 2675, name: 'ChamsMobile', code: '100015', long_code: '100015', last_updated: '2024-05-09 20:36:36' },
  { id: 2682, name: 'CHANELLE MICROFINANCE BANK', code: '090397', long_code: '090397', last_updated: '2024-05-09 20:36:36' },
  { id: 2689, name: 'CHANGHAN RTS MICROFINANCE BANK', code: '090470', long_code: '090470', last_updated: '2024-05-09 20:36:36' },
  { id: 2696, name: 'CHERISH MICROFINANCE BANK', code: '090440', long_code: '090440', last_updated: '2024-05-09 20:36:36' },
  { id: 2703, name: 'Chibueze MFB', code: '090416', long_code: '090416', last_updated: '2024-05-09 20:36:36' },
  { id: 2710, name: 'CHIKUM MICROFINANCE BANK', code: '090141', long_code: '090141', last_updated: '2024-05-09 20:36:36' },
  { id: 2717, name: 'CIT Microfinance Bank', code: '090144', long_code: '090144', last_updated: '2024-05-09 20:36:36' },
  { id: 2724, name: 'Citi Bank', code: '023', long_code: '000009', last_updated: '2024-05-09 20:36:36' },
  { id: 2731, name: 'CoalCamp Microfinance Bank', code: '090254', long_code: '090254', last_updated: '2024-05-09 20:36:36' },
  { id: 2738, name: 'COASTLINE MICRO FINANCE BANK', code: '090374', long_code: '090374', last_updated: '2024-05-09 20:36:36' },
  { id: 2745, name: 'BANKLY MICROFINANCE BANK', code: '090529', long_code: '090529', last_updated: '2024-05-09 20:36:36' },
  { id: 2752, name: 'Consumer Microfinance Bank', code: '090130', long_code: '090130', last_updated: '2024-05-09 20:36:36' },
  { id: 2759, name: 'CONTEC GLOBAL INFOTECH LIMITED (NOWNOW)', code: '100032', long_code: '100032', last_updated: '2024-05-09 20:36:36' },
  { id: 2766, name: 'Coop Mortgage Bank', code: '070021', long_code: '070021', last_updated: '2024-05-09 20:36:36' },
  { id: 2773, name: 'Corestep MICROFINANCE BANK', code: '090365', long_code: '090365', last_updated: '2024-05-09 20:36:36' },
  { id: 2780, name: 'Coronation Merchant Bank', code: '559', long_code: '060001', last_updated: '2024-05-09 20:36:36' },
  { id: 2787, name: 'Covenant Microfinance Bank', code: '070006', long_code: '070006', last_updated: '2024-05-09 20:36:36' },
  { id: 2794, name: 'CREDIT AFRIQUE MICROFINANCE BANK', code: '090159', long_code: '090159', last_updated: '2024-05-09 20:36:36' },
  { id: 2801, name: 'CrossRiver  Microfinance Bank', code: '090429', long_code: '090429', last_updated: '2024-05-09 20:36:36' },
  { id: 2808, name: 'Crutech  Microfinance Bank', code: '090414', long_code: '090414', last_updated: '2024-05-09 20:36:36' },
  { id: 2815, name: 'Davodani  Microfinance Bank', code: '090391', long_code: '090391', last_updated: '2024-05-09 20:36:36' },
  { id: 2822, name: 'Daylight Microfinance Bank', code: '090167', long_code: '090167', last_updated: '2024-05-09 20:36:36' },
  { id: 2829, name: 'e-BARCS MICROFINANCE BANK', code: '090156', long_code: '090156', last_updated: '2024-05-09 20:36:36' },
  { id: 2836, name: 'Eagle Flight MFB', code: '090294', long_code: '090294', last_updated: '2024-05-09 20:36:36' },
  { id: 2843, name: 'Eartholeum', code: '100021', long_code: '100021', last_updated: '2024-05-09 20:36:36' },
  { id: 2850, name: 'EBSU MICROFINANCE Bank', code: '090427', long_code: '090427', last_updated: '2024-05-09 20:36:36' },
  { id: 2857, name: 'EcoBank', code: '050', long_code: '000010', last_updated: '2024-05-09 20:36:36' },
  { id: 2864, name: 'Ecobank Xpress Account', code: '100008', long_code: '100008', last_updated: '2024-05-09 20:36:36' },
  { id: 2871, name: 'Edfin MFB', code: '090310', long_code: '090310', last_updated: '2024-05-09 20:36:36' },
  { id: 2878, name: 'EK-Reliable Microfinance Bank', code: '090389', long_code: '090389', last_updated: '2024-05-09 20:36:36' },
  { id: 2885, name: 'Ekondo Microfinance Bank', code: '090097', long_code: '090097', last_updated: '2024-05-09 20:36:36' },
  { id: 2892, name: 'Emeralds MFB', code: '090273', long_code: '090273', last_updated: '2024-05-09 20:36:36' },
  { id: 2899, name: 'Empire Microfinance Bank', code: '090114', long_code: '090114', last_updated: '2024-05-09 20:36:36' },
  { id: 2906, name: 'Empire Trust MFB', code: '090276', long_code: '090276', last_updated: '2024-05-09 20:36:36' },
  { id: 2913, name: 'Enterprise Bank', code: '084', long_code: '000019', last_updated: '2024-05-09 20:36:36' },
  { id: 2920, name: 'Esan MFB', code: '090189', long_code: '090189', last_updated: '2024-05-09 20:36:36' },
  { id: 2927, name: 'ESO-E MICROFINANCE BANK', code: '090166', long_code: '090166', last_updated: '2024-05-09 20:36:36' },
  { id: 2934, name: 'eTranzact', code: '100006', long_code: '100006', last_updated: '2024-05-09 20:36:36' },
  { id: 2941, name: 'EVANGEL MFB', code: '090304', long_code: '090304', last_updated: '2024-05-09 20:36:36' },
  { id: 2948, name: 'EVERGREEN MICROFINANCE BANK', code: '090332', long_code: '090332', last_updated: '2024-05-09 20:36:36' },
  { id: 2955, name: 'Eyowo MICROFINANCE BANK', code: '090328', long_code: '090328', last_updated: '2024-05-09 20:36:36' },
  { id: 2962, name: 'FAME Microfinance Bank', code: '090330', long_code: '090330', last_updated: '2024-05-09 20:36:36' },
  { id: 2969, name: 'FAST MFB', code: '090179', long_code: '090179', last_updated: '2024-05-09 20:36:36' },
  { id: 2976, name: 'FBNQUEST Merchant Bank', code: '911', long_code: '060002', last_updated: '2024-05-09 20:36:36' },
  { id: 2983, name: 'FCMB BETA', code: '090409', long_code: '090409', last_updated: '2024-05-09 20:36:36' },
  { id: 2990, name: 'FCMB EASY ACCOUNT', code: '100031', long_code: '100031', last_updated: '2024-05-09 20:36:36' },
  { id: 2997, name: 'FCT MFB', code: '090290', long_code: '090290', last_updated: '2024-05-09 20:36:36' },
  { id: 3004, name: 'Federal Polytechnic Nekede Microfinance Bank', code: '090398', long_code: '090398', last_updated: '2024-05-09 20:36:36' },
  { id: 3011, name: 'FEDERAL UNIVERSITY DUTSE  MICROFINANCE BANK', code: '090318', long_code: '090318', last_updated: '2024-05-09 20:36:36' },
  { id: 3018, name: 'FederalPoly NasarawaMFB', code: '090298', long_code: '090298', last_updated: '2024-05-09 20:36:36' },
  { id: 3025, name: 'FEDETH MICROFINANCE BANK', code: '090482', long_code: '090482', last_updated: '2024-05-09 20:36:36' },
  { id: 3032, name: 'FET', code: '100001', long_code: '100001', last_updated: '2024-05-09 20:36:36' },
  { id: 3039, name: 'FFS Microfinance Bank', code: '090153', long_code: '090153', last_updated: '2024-05-09 20:36:36' },
  { id: 3046, name: 'Fidelity Bank', code: '070', long_code: '000007', last_updated: '2024-05-09 20:36:36' },
  { id: 3053, name: 'Fidelity Mobile', code: '100019', long_code: '100019', last_updated: '2024-05-09 20:36:36' },
  { id: 3060, name: 'Fidfund Microfinance Bank', code: '090126', long_code: '090126', last_updated: '2024-05-09 20:36:36' },
  { id: 3067, name: 'FinaTrust Microfinance Bank', code: '090111', long_code: '090111', last_updated: '2024-05-09 20:36:36' },
  { id: 3074, name: 'Finca Microfinance Bank', code: '090400', long_code: '090400', last_updated: '2024-05-09 20:36:36' },
  { id: 3081, name: 'Firmus MICROFINANCE BANK', code: '090366', long_code: '090366', last_updated: '2024-05-09 20:36:36' },
  { id: 3088, name: 'First Bank of Nigeria', code: '011', long_code: '000016', last_updated: '2024-05-09 20:36:36' },
  { id: 3095, name: 'First City Monument Bank', code: '214', long_code: '000003', last_updated: '2024-05-09 20:36:36' },
  { id: 3102, name: 'First Generation Mortgage Bank', code: '070014', long_code: '070014', last_updated: '2024-05-09 20:36:36' },
  { id: 3109, name: 'First Multiple MFB', code: '090163', long_code: '090163', last_updated: '2024-05-09 20:36:36' },
  { id: 3116, name: 'First Option MFB', code: '090285', long_code: '090285', last_updated: '2024-05-09 20:36:36' },
  { id: 3123, name: 'First Royal Microfinance Bank', code: '090164', long_code: '090164', last_updated: '2024-05-09 20:36:36' },
  { id: 3130, name: 'FIRST TRUST MORTGAGE BANK PLC', code: '090005', long_code: '090005', last_updated: '2024-05-09 20:36:36' },
  { id: 3137, name: 'FIRSTMONIE WALLET', code: '100014', long_code: '100014', last_updated: '2024-05-09 20:36:36' },
  { id: 3144, name: 'Fortis Microfinance Bank', code: '070002', long_code: '070002', last_updated: '2024-05-09 20:36:36' },
  { id: 3151, name: 'FortisMobile', code: '100016', long_code: '100016', last_updated: '2024-05-09 20:36:36' },
  { id: 3165, name: 'FSDH Merchant Bank', code: '601', long_code: '400001', last_updated: '2024-05-09 20:36:36' },
  { id: 3172, name: 'Fullrange Microfinance Bank', code: '090145', long_code: '090145', last_updated: '2024-05-09 20:36:36' },
  { id: 3179, name: 'Futminna Microfinance Bank', code: '090438', long_code: '090438', last_updated: '2024-05-09 20:36:36' },
  { id: 3186, name: 'FUTO MFB', code: '090158', long_code: '090158', last_updated: '2024-05-09 20:36:36' },
  { id: 3193, name: 'GARKI MICROFINANCE BANK', code: '90484', long_code: '090484', last_updated: '2024-05-09 20:36:36' },
  { id: 3200, name: 'Gashua Microfinance Bank', code: '90168', long_code: '090168', last_updated: '2024-05-09 20:36:36' },
  { id: 3207, name: 'Gateway Mortgage Bank', code: '070009', long_code: '070009', last_updated: '2024-05-09 20:36:36' },
  { id: 3214, name: 'Giginya MFB', code: '090411', long_code: '090411', last_updated: '2024-05-09 20:36:36' },
  { id: 3221, name: 'Girei MFB', code: '090186', long_code: '090186', last_updated: '2024-05-09 20:36:36' },
  { id: 3228, name: 'Giwa Microfinance Bank', code: '090441', long_code: '090441', last_updated: '2024-05-09 20:36:36' },
  { id: 3235, name: 'GLOBUS Bank', code: '000027', long_code: '000027', last_updated: '2024-05-09 20:36:36' },
  { id: 3242, name: 'Glory MFB', code: '090278', long_code: '090278', last_updated: '2024-05-09 20:36:36' },
  { id: 3249, name: 'GMB Microfinance Bank', code: '090408', long_code: '090408', last_updated: '2024-05-09 20:36:36' },
  { id: 3256, name: 'GoMoney', code: '100022', long_code: '100022', last_updated: '2024-05-09 20:36:36' },
  { id: 3263, name: 'Good Neighbours Microfinance Bank', code: '090467', long_code: '090467', last_updated: '2024-05-09 20:36:36' },
  { id: 3270, name: 'Gowans Microfinance Bank', code: '090122', long_code: '090122', last_updated: '2024-05-09 20:36:36' },
  { id: 3277, name: 'Grant Microfinance Bank', code: '090335', long_code: '090335', last_updated: '2024-05-09 20:36:36' },
  { id: 3284, name: 'GREENBANK MICROFINANCE BANK', code: '090178', long_code: '090178', last_updated: '2024-05-09 20:36:36' },
  { id: 3291, name: 'Greenville Microfinance bank', code: '090269', long_code: '090269', last_updated: '2024-05-09 20:36:36' },
  { id: 3298, name: 'Greenwich Merchant Bank', code: '060004', long_code: '060004', last_updated: '2024-05-09 20:36:36' },
  { id: 3305, name: 'Grooming Microfinance bank', code: '090195', long_code: '090195', last_updated: '2024-05-09 20:36:36' },
  { id: 3312, name: 'GTBank Plc', code: '058', long_code: '000013', last_updated: '2024-05-09 20:36:36' },
  { id: 3319, name: 'GTI  Microfinance Bank', code: '090385', long_code: '090385', last_updated: '2024-05-09 20:36:36' },
  { id: 3326, name: 'GTMobile', code: '100009', long_code: '100009', last_updated: '2024-05-09 20:36:36' },
  { id: 3333, name: 'Hackman Microfinance Bank', code: '090147', long_code: '090147', last_updated: '2024-05-09 20:36:36' },
  { id: 3340, name: 'Haggai Mortgage Bank', code: '070017', long_code: '070017', last_updated: '2024-05-09 20:36:36' },
  { id: 3347, name: 'Hala MFB', code: '090291', long_code: '090291', last_updated: '2024-05-09 20:36:36' },
  { id: 3354, name: 'Hasal Microfinance Bank', code: '090121', long_code: '090121', last_updated: '2024-05-09 20:36:36' },
  { id: 3361, name: 'Headway Microfinance Bank', code: '090363', long_code: '090363', last_updated: '2024-05-09 20:36:36' },
  { id: 3368, name: 'Hedonmark', code: '100017', long_code: '100017', last_updated: '2024-05-09 20:36:36' },
  { id: 3375, name: 'Heritage', code: '030', long_code: '000020', last_updated: '2024-05-09 20:36:36' },
  { id: 3382, name: 'Highland Microfinance Bank', code: '090418', long_code: '090418', last_updated: '2024-05-09 20:36:36' },
  { id: 3389, name: 'Hope Payment Service Bank', code: '120002', long_code: '120002', last_updated: '2024-05-09 20:36:36' },
  { id: 3396, name: 'IBETO  Microfinance Bank', code: '090439', long_code: '090439', last_updated: '2024-05-09 20:36:36' },
  { id: 3403, name: 'Ibile Microfinance Bank', code: '090118', long_code: '090118', last_updated: '2024-05-09 20:36:36' },
  { id: 3410, name: 'IKENNE MICROFINANCE BANK', code: '090324', long_code: '090324', last_updated: '2024-05-09 20:36:36' },
  { id: 3417, name: 'Ikire MFB', code: '090279', long_code: '090279', last_updated: '2024-05-09 20:36:36' },
  { id: 3424, name: 'Ikire Microfinance Bank', code: '090275', long_code: '090275', last_updated: '2024-05-09 20:36:36' },
  { id: 3431, name: 'ILASAN MICROFINANCE BANK', code: '090370', long_code: '090370', last_updated: '2024-05-09 20:36:36' },
  { id: 3438, name: 'Illorin Microfinance Bank', code: '090350', long_code: '090350', last_updated: '2024-05-09 20:36:36' },
  { id: 3445, name: 'Ilora Microfinance Bank', code: '090430', long_code: '090430', last_updated: '2024-05-09 20:36:36' },
  { id: 3452, name: 'Imo State MFB', code: '090258', long_code: '090258', last_updated: '2024-05-09 20:36:36' },
  { id: 3459, name: 'Imowo Microfinance Bank', code: '090417', long_code: '090417', last_updated: '2024-05-09 20:36:36' },
  { id: 3466, name: 'Imperial Homes Mortgage Bank', code: '415', long_code: '100024', last_updated: '2024-05-09 20:36:36' },
  { id: 3473, name: 'INFINITY MICROFINANCE BANK', code: '090157', long_code: '090157', last_updated: '2024-05-09 20:36:36' },
  { id: 3480, name: 'Infinity Trust Mortgage Bank', code: '070016', long_code: '070016', last_updated: '2024-05-09 20:36:36' },
  { id: 3487, name: 'Insight Microfinance Bank', code: '090434', long_code: '090434', last_updated: '2024-05-09 20:36:36' },
  { id: 3494, name: 'Interland MFB', code: '090386', long_code: '090386', last_updated: '2024-05-09 20:36:36' },
  { id: 3501, name: 'Interswitch Financial Inclusion Services (IFIS)', code: '110010', long_code: '110010', last_updated: '2024-05-09 20:36:36' },
  { id: 3508, name: 'IRL microfinance bank Limited', code: '090149', long_code: '090149', last_updated: '2024-05-09 20:36:36' },
  { id: 3515, name: 'ISALEOYO MICROFINANCE BANK', code: '090377', long_code: '090377', last_updated: '2024-05-09 20:36:36' },
  { id: 3522, name: 'Ishie  Microfinance Bank', code: '090428', long_code: '090428', last_updated: '2024-05-09 20:36:36' },
  { id: 3529, name: 'Izon Microfinance Bank', code: '090421', long_code: '090421', last_updated: '2024-05-09 20:36:36' },
  { id: 3536, name: 'JAIZ Bank', code: '301', long_code: '000006', last_updated: '2024-05-09 20:36:36' },
  { id: 3543, name: 'JubileeLife', code: '90003', long_code: '90003', last_updated: '2024-05-09 20:36:36' },
  { id: 3550, name: 'Kadpoly MICROFINANCE BANK', code: '090320', long_code: '090320', last_updated: '2024-05-09 20:36:36' },
  { id: 3557, name: 'KCMB MICROFINANCE BANK', code: '090191', long_code: '090191', last_updated: '2024-05-09 20:36:36' },
  { id: 3564, name: 'Keystone Bank', code: '082', long_code: '000002', last_updated: '2024-05-09 20:36:36' },
  { id: 3571, name: 'KINGDOM COLLEGE MICROFINANCE BANK', code: '090487', long_code: '090487', last_updated: '2024-05-09 20:36:36' },
  { id: 3578, name: 'KongaPay', code: '100025', long_code: '100025', last_updated: '2024-05-09 20:36:36' },
  { id: 3585, name: 'Kontagora MFB', code: '090299', long_code: '090299', last_updated: '2024-05-09 20:36:36' },
  { id: 3592, name: 'KREDI MONEY MICROFINANCE BANK LTD', code: '090380', long_code: '090380', last_updated: '2024-05-09 20:36:36' },
  { id: 4082, name: 'Build Microfinance Bank', code: '090613', long_code: '090613', last_updated: '2024-06-12 14:01:47' },
  { id: 4089, name: 'MADOBI MFB', code: '090605', long_code: '090605', last_updated: '2024-06-12 14:01:47' },
  { id: 4096, name: 'FOCUS MFB', code: '090709', long_code: '090709', last_updated: '2024-06-12 14:01:47' },
  { id: 4103, name: 'UCEE MFB', code: '090706', long_code: '090706', last_updated: '2024-06-12 14:01:47' },
  { id: 4110, name: 'ISUA MFB', code: '090701', long_code: '090701', last_updated: '2024-06-12 14:01:47' },
  { id: 5356, name: 'TransPay MFB', code: '090708', long_code: '090708', last_updated: '2024-09-04 14:09:03' },
  { id: 5363, name: 'DAILY TRUST MFB', code: '090705', long_code: '090705', last_updated: '2024-09-04 14:09:03' },
  { id: 5370, name: 'Branch International Finance Company Limited', code: '050006', long_code: '050006', last_updated: '2024-09-04 14:09:03' },
  { id: 5384, name: 'ZITRA MFB', code: '090718', long_code: '090718', last_updated: '2024-09-04 14:09:03' },
  { id: 5391, name: 'ZEDVANCE Financial Limited', code: '050019', long_code: '050019', last_updated: '2024-09-04 14:09:03' },
  { id: 5398, name: 'IHIALA MFB', code: '090725', long_code: '090725', last_updated: '2024-09-04 14:09:03' },
  { id: 5405, name: 'DESTINY MFB', code: '090723', long_code: '090723', last_updated: '2024-09-04 14:09:04' },
  { id: 5412, name: 'LAWYERS MFB', code: '090724', long_code: '090724', last_updated: '2024-09-04 14:09:04' },
  { id: 5419, name: 'RIC MFB', code: '090720', long_code: '090720', last_updated: '2024-09-04 14:09:04' },
  { id: 5426, name: 'UNUBI MFB', code: '090719', long_code: '090719', last_updated: '2024-09-04 14:09:04' },
  { id: 5433, name: 'TENN MFB', code: '090716', long_code: '090716', last_updated: '2024-09-04 14:09:04' },
  { id: 5440, name: 'ILE-OLUJI MFB', code: '090710', long_code: '090710', last_updated: '2024-09-04 14:09:04' },
  { id: 5447, name: 'COOPFUND MFB', code: '090717', long_code: '090717', last_updated: '2024-09-04 14:09:04' },
  { id: 5454, name: 'CREDIT DIRECT LIMITED', code: '110049', long_code: '110049', last_updated: '2024-09-04 14:09:04' },
  { id: 5461, name: 'DAL MFB', code: '090596', long_code: '090596', last_updated: '2024-09-04 14:09:04' },
  { id: 5468, name: 'Emaar MFB', code: '090712', long_code: '090712', last_updated: '2024-09-04 14:09:04' },
  { id: 5475, name: 'AKALABO MFB', code: '090698', long_code: '090698', last_updated: '2024-09-04 14:09:04' },
  { id: 5482, name: 'TOFA MFB', code: '090714', long_code: '090714', last_updated: '2024-09-04 14:09:04' },
  { id: 5489, name: 'THE MILLENNIUM MFB', code: '090711', long_code: '090711', last_updated: '2024-09-04 14:09:04' },
  { id: 5496, name: 'UBA MONI', code: '000040', long_code: '000040', last_updated: '2024-09-04 14:09:04' }
];

const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const migrateAllBanks = async () => {
  try {
    await connectToDatabase();
    const Bank = mongoose.model('Bank');
    
    console.log('🏦 STARTING COMPLETE BANKS MIGRATION');
    console.log('====================================\n');
    console.log(`📊 Migrating ${legacyBanksData.length} banks with ALL fields...\n`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    for (const legacyBank of legacyBanksData) {
      try {
        // Check if bank already exists by ID or code
        const existingById = await Bank.findOne({ id: legacyBank.id });
        const existingByCode = await Bank.findOne({ code: legacyBank.code });
        
        if (existingById || existingByCode) {
          console.log(`⏭️ SKIPPED: ${legacyBank.name} (ID: ${legacyBank.id}, Code: ${legacyBank.code})`);
          skippedCount++;
          continue;
        }
        
        // Create bank with ALL fields
        const newBank = new Bank({
          // Core fields from legacy system
          id: legacyBank.id,
          name: legacyBank.name,
          code: legacyBank.code,
          long_code: legacyBank.long_code,
          last_updated: new Date(legacyBank.last_updated),
          
          // Additional fields
          status: 'ACTIVE',
          country: 'NG'
        });
        
        await newBank.save();
        migratedCount++;
        
        console.log(`✅ MIGRATED: ${legacyBank.name}`);
        
      } catch (error) {
        console.log(`❌ FAILED: ${legacyBank.name}`);
        console.log(`   Error: ${error.message}`);
        errors.push({
          bank: legacyBank.name,
          error: error.message
        });
      }
    }
    
    // Generate comprehensive report
    await generateMigrationReport(migratedCount, skippedCount, errors);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

const generateMigrationReport = async (migratedCount, skippedCount, errors) => {
  console.log('\n🎉 COMPLETE BANKS MIGRATION FINISHED!');
  console.log('====================================\n');
  
  console.log('📊 MIGRATION SUMMARY:');
  console.log(`   ✅ Successfully migrated: ${migratedCount}`);
  console.log(`   ⏭️ Skipped (already exist): ${skippedCount}`);
  console.log(`   ❌ Failed: ${errors.length}`);
  console.log(`   📋 Total processed: ${legacyBanksData.length}`);
  
  // Show banks by type/category
  const bankTypes = analyzeBankTypes(legacyBanksData);
  console.log('\n🏛️  BANKS BY TYPE:');
  Object.entries(bankTypes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} banks`);
  });
  
  // Show sample migrated banks
  if (migratedCount > 0) {
    const Bank = mongoose.model('Bank');
    const sampleBanks = await Bank.find()
      .sort({ id: 1 })
      .limit(10)
      .select('id name code long_code status');
    
    console.log('\n📋 SAMPLE MIGRATED BANKS:');
    sampleBanks.forEach(bank => {
      console.log(`   ${bank.id} - ${bank.name} (${bank.code})`);
    });
  }
  
  if (errors.length > 0) {
    console.log('\n❌ MIGRATION ERRORS:');
    errors.slice(0, 5).forEach(err => {
      console.log(`   - ${err.bank}: ${err.error}`);
    });
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more errors`);
    }
  }
  
  console.log('\n🌐 ALL BANKS NOW AVAILABLE WITH FULL DATA:');
  console.log('   ✅ id, name, code, long_code, last_updated');
  console.log('   ✅ status, country, displayName');
  console.log('   ✅ createdAt, updatedAt');
};

// Analyze bank types based on names
const analyzeBankTypes = (banks) => {
  const types = {
    'Microfinance Banks': 0,
    'Commercial Banks': 0,
    'Mobile/Digital Banks': 0,
    'Merchant Banks': 0,
    'Mortgage Banks': 0,
    'Payment Service Banks': 0,
    'Other Institutions': 0
  };
  
  banks.forEach(bank => {
    const name = bank.name.toLowerCase();
    const code = bank.code;
    
    if (name.includes('microfinance') || name.includes('mfb') || (code.startsWith('090') && code.length === 6)) {
      types['Microfinance Banks']++;
    } else if (name.includes('mobile') || name.includes('wallet') || name.includes('pay') || code.startsWith('100')) {
      types['Mobile/Digital Banks']++;
    } else if (name.includes('merchant') || code.startsWith('060') || code.startsWith('050')) {
      types['Merchant Banks']++;
    } else if (name.includes('mortgage') || code.startsWith('070')) {
      types['Mortgage Banks']++;
    } else if (name.includes('psb') || code.startsWith('120')) {
      types['Payment Service Banks']++;
    } else if (name.includes('bank') && !name.includes('microfinance')) {
      types['Commercial Banks']++;
    } else {
      types['Other Institutions']++;
    }
  });
  
  return types;
};

// Run the complete banks migration
migrateAllBanks().catch(console.error);