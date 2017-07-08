const chai = require('chai');
const mocha = require('mocha');
const app = require('../victorops-twilio');
const assert = require('assert');

const twiml = {gather: function() {return twiml}, say: function() {}, redirect: function() {}, dial: function() {return twiml}, number: function() {}, hangup: function() {}, record: function() {}};
const context = {API_HOST: 'api.victorops.com', ALERT_HOST: 'alert.victorops.com', API_ID: 'ee36e5d9', API_KEY: 'c441281d680a6508cfc16d47187c5582', messages: {}, REST_ENDPOINT_API_KEY: '1394aab4-c4e1-4fdb-890b-e40f64e2b35a', TWILIO_URL: 'string', NUMBER_OF_MENUS: '2', VOICE: undefined};
const event = {payloadString: JSON.stringify({}), To: '+1 444-333-2222'};
const payload = {callerId: '+15555555555', VOICE: 'woman', teamsArray: [{name: 'Everyone', slug: 'everyone'}], phoneNumbers: [{user: 'dscott', phone: '+1 555-777-9999'}], runFunction: 'teamsMenu'};

describe('main()', function() {
  const p = app.main(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.main === 'function', true, typeof app.main);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('callOrMessage()', function() {
  const p = app.callOrMessage(twiml, context, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.callOrMessage === 'function', true, typeof app.callOrMessage);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('teamsMenu()', function() {
  const p = app.teamsMenu(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.teamsMenu === 'function', true, typeof app.teamsMenu);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('assignTeam()', function() {
  const p = app.assignTeam(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.assignTeam === 'function', true, typeof app.assignTeam);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('buildOnCallList()', function() {
  const p = app.buildOnCallList(twiml, context, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.buildOnCallList === 'function', true, typeof app.buildOnCallList);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('call()', function() {
  const p = app.call(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.call === 'function', true, typeof app.call);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('isHuman()', function() {
  const p = app.isHuman(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.isHuman === 'function', true, typeof app.isHuman);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('leaveAMessage()', function() {
  const p = app.leaveAMessage(twiml, context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.leaveAMessage === 'function', true, typeof app.leaveAMessage);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});

describe('postToVictorOps()', function() {
  const p = app.postToVictorOps(context, event, payload);
  it(`should be a function`, function() {
    assert.equal(typeof app.postToVictorOps === 'function', true, typeof app.postToVictorOps);
  });
  it(`should return a promise`, function() {
    assert.equal(p instanceof Promise, true, typeof p);
  });
  it(`should have it's returned promise resolved`, function(done) {
    p.then(() => done());
  });
});