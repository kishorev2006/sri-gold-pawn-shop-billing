const { registerDatabaseIpcHandlers } = require('./databaseHandler');
const { registerCustomerIpcHandlers } = require('./customerHandler');
const { registerLoanIpcHandlers } = require('./loanHandler');
const { registerPaymentIpcHandlers } = require('./paymentHandler');
const { registerReportIpcHandlers } = require('./reportHandler');
const { registerSettingIpcHandlers } = require('./settingHandler');

function registerIpcHandlers() {
  registerDatabaseIpcHandlers();
  registerCustomerIpcHandlers();
  registerLoanIpcHandlers();
  registerPaymentIpcHandlers();
  registerReportIpcHandlers();
  registerSettingIpcHandlers();
}

module.exports = {
  registerIpcHandlers
};

