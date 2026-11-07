const test = require('node:test');
const assert = require('node:assert/strict');
const {profileLabel,publishLabel,textBytes,roomPattern} = require('../js/app.js');
test('only current verified xID proofs receive verified labels',() => {
  assert.equal(profileLabel({}),'Local profile');
  for (const status of ['unknown','stale','revoked',undefined]) {
    assert.doesNotMatch(profileLabel({xid:{name:'test.epix',status}}),/· verified xID/);
  }
  assert.equal(profileLabel({xid:{name:'test.epix',status:'verified'}}),'test.epix · verified xID');
});
test('publication status never implies delivery or online recipients',() => {
  assert.equal(publishLabel({status:'local_only',peers:0}),'Saved locally; no peer accepted yet.');
  assert.equal(publishLabel({status:'accepted_by_peers',peers:0}),'Saved locally; no peer accepted yet.');
  assert.match(publishLabel({status:'accepted_by_peers',peers:2}),/accepted by 2 peers/);
  assert.match(publishLabel({status:'accepted_by_peers',peers:2}),/does not confirm anyone read it/);
});
test('text limit counts UTF-8 bytes; room names exclude path and HTML syntax',() => {
  assert.equal(textBytes('💚'),4);
  assert.equal(textBytes('hello'),5);
  for (const room of ['../secret','a/b','<img>','a b','','A']) assert.equal(roomPattern.test(room),false);
  for (const room of ['commons','our-neighborhood','help_2']) assert.equal(roomPattern.test(room),true);
});
