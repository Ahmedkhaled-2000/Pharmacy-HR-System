function calculateRatesAndSalaries(input = {}) {
  const salaryInput = input?.salaryInput ?? input?.salary ?? input?.baseSalary ?? 0;
  const workHoursPerDay = input?.workHoursPerDay ?? input?.workHours ?? 8;
  const workDaysPerMonth = input?.workDaysPerMonth ?? input?.workDays ?? 26;
  const breakHours = input?.breakHours ?? input?.defaultBreakHours ?? 0;

  const rawSalary = parseFloat(salaryInput) || 0;
  const hours = parseFloat(workHoursPerDay) || 8;
  const days = parseFloat(workDaysPerMonth) || 26;
  const breakH = parseFloat(breakHours) || 0;
  const netHours = Math.max(1, hours - breakH);

  let monthlySalary = 0;
  let dailyRate = 0;
  let hourlyRate = 0;

  if (rawSalary <= 0 || days <= 0 || hours <= 0) {
    return { monthlySalary: 0, dailyRate: 0, hourlyRate: 0, netHours, workHoursPerDay: hours, workDaysPerMonth: days };
  }

  if (rawSalary >= 2000) {
    monthlySalary = rawSalary;
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else if (rawSalary >= 150) {
    monthlySalary = Math.round(rawSalary * hours * 100) / 100;
    dailyRate = Math.round((monthlySalary / days) * 100) / 100;
    hourlyRate = Math.round((dailyRate / netHours) * 100) / 100;
  } else {
    hourlyRate = rawSalary;
    dailyRate = Math.round(hourlyRate * netHours * 100) / 100;
    monthlySalary = Math.round(dailyRate * days * 100) / 100;
  }

  return { monthlySalary, dailyRate, hourlyRate, netHours, workHoursPerDay: hours, workDaysPerMonth: days };
}

// Test Nada Ashraf (Code 119)
console.log('=== TEST 1: Nada Ashraf (Code 119) ===');
const nadaRates = calculateRatesAndSalaries({
  salaryInput: 650,
  workHoursPerDay: 10,
  workDaysPerMonth: 26,
  breakHours: 0
});
console.log('Nada Rates:', nadaRates);
// Row 1: 9.29 hours
const r1Earnings = Math.round(9.29 * nadaRates.hourlyRate * 100) / 100;
console.log('Row 1 (9.29 hrs):', r1Earnings, 'EGP (Previously was 6012.50 EGP!)');
const r14Earnings = Math.round(21.50 * nadaRates.hourlyRate * 100) / 100;
console.log('Row 14 (21.50 hrs):', r14Earnings, 'EGP (Previously was 13975.00 EGP!)');

// Test Anas Khaled (Code 116)
console.log('\n=== TEST 2: Anas Khaled (Code 116) ===');
const anasRates = calculateRatesAndSalaries({
  salaryInput: 875,
  workHoursPerDay: 8,
  workDaysPerMonth: 26,
  breakHours: 0
});
console.log('Anas Rates:', anasRates);
const anasShift = Math.round(7.65 * anasRates.hourlyRate * 100) / 100;
console.log('Anas Day 1 (7.65 hrs):', anasShift, 'EGP');

// Test Fixed Salary Employee (6000 EGP)
console.log('\n=== TEST 3: Fixed Salary Employee (6000 EGP) ===');
const fixedRates = calculateRatesAndSalaries({
  salaryInput: 6000,
  workHoursPerDay: 8,
  workDaysPerMonth: 26,
  breakHours: 0
});
console.log('Fixed Rates:', fixedRates);
const fixedShift = Math.round(8 * fixedRates.hourlyRate * 100) / 100;
console.log('Fixed Day 1 (8 hrs):', fixedShift, 'EGP (Previously was 48000 EGP!)');
