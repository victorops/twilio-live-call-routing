const chai = require('chai');
const mocha = require('mocha');
const app = require('../victorops-twilio');

console.log(app.callOrMessage);

const twiml = {gather: function() {return twiml}, say: function() {}};
const voice = {voice: 'my voice'};
const callerId = 'alsjdflkajsdflkjasdlf';

const assert = require('assert');

describe('callOrMessage()', function() {
  const p = app.callOrMessage(voice, twiml);
  it(`should be true`, function() {
    assert.equal(typeof app.callOrMessage === 'function', true, typeof app.callOrMessage);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, 'lksdf');
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});