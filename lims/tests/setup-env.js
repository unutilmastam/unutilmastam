/**
 * Test muhiti. ES-modul importlari test faylidagi oddiy satrlardan oldin
 * bajarilgani uchun sozlamalar aynan shu alohida modulda beriladi va
 * api.test.js da eng birinchi bo'lib import qilinadi.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://labcore:labcore@127.0.0.1:5432/labcore_test';
process.env.DATA_DIR = process.env.TEST_DATA_DIR || '/tmp/labcore-test-data';
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.EDIT_WINDOW_HOURS = '24';
process.env.LAB_NAME = 'Test laboratoriya';
// Navbat testlari kun davomida istalgan vaqtda ishlashi uchun ish vaqti keng
process.env.WORK_START = '00:00';
process.env.WORK_END = '23:45';
