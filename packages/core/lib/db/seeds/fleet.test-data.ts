// Dữ liệu mẫu fleet dùng chung cho seed, test tích hợp và e2e (task 05).
import { DEFAULT_TIME_ZONE, toTenantDate } from '../../time';
import { SEED_TENANTS } from './identity.test-data';

const id = (n: number) => `0190b000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const addDaysToTenantDate = (
  baseInstant: Date,
  days: number,
  timeZone = DEFAULT_TIME_ZONE,
): string => {
  const d = new Date(baseInstant.getTime() + days * 24 * 60 * 60 * 1000);
  return toTenantDate(d, timeZone);
};

export function getSeedFleetData(baseInstant = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const rel = (days: number) => addDaysToTenantDate(baseInstant, days, timeZone);
  const phucAn = SEED_TENANTS.phucAn.id;
  const saoViet = SEED_TENANTS.saoViet.id;

  return {
    tractors: [
      // Phúc An
      {
        id: id(0x1),
        tenantId: phucAn,
        plateNumber: '51C-482.17',
        model: 'Hino 700',
        ownership: 'OWNED' as const,
        fuelNormLitersPer100km: '35.00',
        currentOdometer: 125000,
        registrationExpiry: rel(60),
        insuranceExpiry: rel(90),
        transportBadgeExpiry: rel(180),
        permittedGrossWeightTons: '40.00',
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x2),
        tenantId: phucAn,
        plateNumber: '51C-228.40',
        model: 'Hyundai Xcient',
        ownership: 'OWNED' as const,
        fuelNormLitersPer100km: '36.50',
        currentOdometer: 210000,
        registrationExpiry: rel(-5), // Đã hết hạn đăng kiểm
        insuranceExpiry: rel(10), // Sắp hết hạn bảo hiểm
        transportBadgeExpiry: rel(120),
        permittedGrossWeightTons: '42.00',
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x3),
        tenantId: phucAn,
        plateNumber: '51C-991.12',
        model: 'Isuzu Giga',
        ownership: 'LEASED' as const,
        fuelNormLitersPer100km: '33.00',
        currentOdometer: 85000,
        registrationExpiry: rel(7), // Sắp hết hạn đăng kiểm (7 ngày)
        insuranceExpiry: rel(30),
        transportBadgeExpiry: rel(30),
        permittedGrossWeightTons: '38.00',
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x4),
        tenantId: phucAn,
        plateNumber: '51C-773.05',
        model: 'Daewoo Novus',
        ownership: 'OWNED' as const,
        fuelNormLitersPer100km: '34.00',
        currentOdometer: 150000,
        registrationExpiry: rel(180),
        insuranceExpiry: rel(180),
        transportBadgeExpiry: rel(180),
        permittedGrossWeightTons: '39.00',
        status: 'AVAILABLE' as const,
      },
      // Sao Việt
      {
        id: id(0x11),
        tenantId: saoViet,
        plateNumber: '51C-666.88',
        model: 'Fuso FV517',
        ownership: 'OWNED' as const,
        fuelNormLitersPer100km: '35.00',
        currentOdometer: 95000,
        registrationExpiry: rel(100),
        insuranceExpiry: rel(100),
        transportBadgeExpiry: rel(100),
        permittedGrossWeightTons: '40.00',
        status: 'AVAILABLE' as const,
      },
    ],
    trailers: [
      // Phúc An
      {
        id: id(0x21),
        tenantId: phucAn,
        plateNumber: '51R-112.23',
        trailerType: '20FT' as const,
        canCarryTwin20: false,
        hasGensetPower: false,
        tareWeightTons: '3.80',
        maxPayloadTons: '28.00',
        inspectionExpiry: rel(45),
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x22),
        tenantId: phucAn,
        plateNumber: '51R-334.56',
        trailerType: '40FT' as const,
        canCarryTwin20: false,
        hasGensetPower: false,
        tareWeightTons: '4.50',
        maxPayloadTons: '32.00',
        inspectionExpiry: rel(8), // Sắp hết hạn kiểm định (8 ngày)
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x23),
        tenantId: phucAn,
        plateNumber: '51R-556.78',
        trailerType: '40FT_COMBO' as const,
        canCarryTwin20: true, // Chở Twin 20
        hasGensetPower: true, // Có máy lạnh genset
        tareWeightTons: '5.20',
        maxPayloadTons: '34.00',
        inspectionExpiry: rel(-2), // Đã hết hạn kiểm định (2 ngày trước)
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x24),
        tenantId: phucAn,
        plateNumber: '51R-778.90',
        trailerType: '45FT' as const,
        canCarryTwin20: false,
        hasGensetPower: false,
        tareWeightTons: '4.80',
        maxPayloadTons: '30.00',
        inspectionExpiry: rel(120),
        status: 'AVAILABLE' as const,
      },
      // Sao Việt
      {
        id: id(0x31),
        tenantId: saoViet,
        plateNumber: '51R-666.88',
        trailerType: '40FT' as const,
        canCarryTwin20: false,
        hasGensetPower: false,
        tareWeightTons: '4.50',
        maxPayloadTons: '32.00',
        inspectionExpiry: rel(150),
        status: 'AVAILABLE' as const,
      },
    ],
    drivers: [
      // Phúc An
      {
        id: id(0x41),
        tenantId: phucAn,
        fullName: 'Trần Văn Lộc',
        phone: '0903123456',
        nationalIdNo: '079085001234',
        licenseNo: 'GPLX-79-112233',
        licenseClass: 'FC',
        licenseExpiry: rel(2), // GPLX còn 2 ngày
        dgCertificateNo: 'DG-79-001',
        dgCertificateExpiry: rel(90),
        employmentType: 'FULL_TIME' as const,
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x42),
        tenantId: phucAn,
        fullName: 'Nguyễn Hoàng Nam',
        phone: '0908765432',
        nationalIdNo: '079088005678',
        licenseNo: 'GPLX-79-445566',
        licenseClass: 'FC',
        licenseExpiry: rel(180),
        dgCertificateNo: 'DG-79-002',
        dgCertificateExpiry: rel(12), // DG còn 12 ngày
        employmentType: 'FULL_TIME' as const,
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x43),
        tenantId: phucAn,
        fullName: 'Lê Minh Tuấn',
        phone: '0912334455',
        nationalIdNo: '079090009988',
        licenseNo: 'GPLX-79-778899',
        licenseClass: 'FC',
        licenseExpiry: rel(-3), // GPLX đã hết hạn
        dgCertificateNo: null,
        dgCertificateExpiry: null,
        employmentType: 'CONTRACT' as const,
        status: 'AVAILABLE' as const,
      },
      {
        id: id(0x44),
        tenantId: phucAn,
        fullName: 'Phạm Quốc Huy',
        phone: '0987654321',
        nationalIdNo: '079092003344',
        licenseNo: 'GPLX-79-990011',
        licenseClass: 'FC',
        licenseExpiry: rel(365),
        dgCertificateNo: null,
        dgCertificateExpiry: null,
        employmentType: 'FULL_TIME' as const,
        status: 'AVAILABLE' as const,
      },
      // Sao Việt
      {
        id: id(0x51),
        tenantId: saoViet,
        fullName: 'Võ Văn Thắng',
        phone: '0909998877',
        nationalIdNo: '079094001122',
        licenseNo: 'GPLX-79-556677',
        licenseClass: 'FC',
        licenseExpiry: rel(200),
        dgCertificateNo: null,
        dgCertificateExpiry: null,
        employmentType: 'FULL_TIME' as const,
        status: 'AVAILABLE' as const,
      },
    ],
  };
}
