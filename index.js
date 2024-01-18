const router = module.exports = require('express').Router();

router.use('/museums', require('./museums'));
router.use('/artworks', require('./artworks'));
router.use('/', require('./users'));