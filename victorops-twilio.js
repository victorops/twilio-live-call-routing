// ==========================================================================
// Copyright 2017 VictorOps, Inc.
// https://github.com/victorops/twilio-live-call-routing/blob/master/LICENSE
// ==========================================================================

const qs = require('qs');
const got = require('got');
const moment = require('moment');

module.exports = {assignTeam, buildOnCallList, call, callOrMessage, handler, isHuman, leaveAMessage, main, postToVictorOps, teamsMenu};

 
function handler(context, event, callback) {

  const {API_ID, API_KEY, REST_ENDPOINT_API_KEY, TWILIO_URL, NUMBER_OF_MENUS} = context;
  const {payloadString, To} = event;
  const payload = payloadString === undefined ? {} : JSON.parse(payloadString);
  const {runFunction} = payload;
  let {ALERT_HOST, API_HOST, VOICE} = context;
  context.ALERT_HOST = ALERT_HOST === undefined ? 'alert.victorops.com' : ALERT_HOST;
  context.API_HOST = API_HOST === undefined ? 'api.victorops.com' : API_HOST;
  payload.VOICE = (VOICE === 'alice' || VOICE === 'man') ? VOICE : 'woman';
  let {callerId} = payload;
  payload.callerId = callerId === undefined ? To : callerId;

  let twiml = new Twilio.twiml.VoiceResponse();

if (API_ID === undefined || API_KEY === undefined || REST_ENDPOINT_API_KEY === undefined || TWILIO_URL === undefined) {
  twiml.say({VOICE}, `There is a missing configuration value. Please contact your administrator to fix the problem.`);

  callback(null, twiml);
  return;
}

  main(twiml, context, event, payload).then(result => callback(null, result)).catch(err => console.log(err));

}


function main(twiml, context, event, payload) {

  const {NUMBER_OF_MENUS} = context;
  const {runFunction} = payload;
  let entryFunction;

  if (runFunction === undefined) {
    switch (NUMBER_OF_MENUS) {
      case '0':
      case '1':
        entryFunction = () => teamsMenu(twiml, context, event, payload);
        break;
      default:
        entryFunction = () => callOrMessage(twiml, payload);
        break;
    }
  }

  switch (runFunction) {
    case 'teamsMenu':
      return teamsMenu(twiml, context, event, payload);
      break;
    case 'assignTeam':
      return assignTeam(twiml, event, payload);
      break;
    case 'buildOnCallList':
      return buildOnCallList(twiml, context, payload);
      break;
    case 'call':
      return call(twiml, context, event, payload);
      break;
    case 'isHuman':
      return isHuman(twiml, event, payload);
      break;
    case 'leaveAMessage':
      return leaveAMessage(twiml, event, payload);
      break;
    case 'postToVictorOps':
      return postToVictorOps(event, context, payload);
      break;
    default:
      return entryFunction();
      break;
  }

}


function callOrMessage(twiml, payload) {

  return new Promise((resolve, reject) => {

    const {callerId, VOICE} = payload;

    const newPayload = {callerId, runFunction: 'teamsMenu'};
    const payloadString = JSON.stringify(newPayload);

    twiml.gather({
      input: 'dtmf',
      timeout: 10,
      action: `/victorops?${qs.stringify({payloadString})}`,
      numDigits: 1
    }).say({VOICE}, 'Welcome to Victor Ops Live Call Routing. Please press 1 to reach an on-call representative or press 2 to leave a message. Press zero to repeat this menu.');
    twiml.say({VOICE}, 'We did not receive a response. Goodbye.');
    
    resolve(twiml);

  });

}


function teamsMenu(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {API_HOST, API_ID, API_KEY, NUMBER_OF_MENUS} = context;
    const {Digits} = event;
    const {callerId, VOICE} = payload;
    let {goToVM} = payload;

    if (Digits === '0') {
      const newPayload = {callerId};
      const payloadString = JSON.stringify(newPayload);
      twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
      resolve(twiml);
    } else {

      got(`https://${API_HOST}/api-public/v1/team`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VO-Api-Key': API_KEY,
            'X-VO-Api-Id': API_ID
          }
        }).then(response => {

          let teamsArray;

          if (Digits === '2') {
            goToVM = 'yes';
          }

          if (context.TEAM_1 === undefined) {
            teamsArray = JSON.parse(response.body).map(team => {return {name: team.name, slug: team.slug};});
          } else {
            teamsArray = buildManualTeamList(1, []);
          }

          if (teamsArray.length === 0) {
            twiml.say({VOICE}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
          } else if (teamsArray.length === 1 || NUMBER_OF_MENUS === '0') {
            teamsArray = [teamsArray[0]];
            const newPayload = {callerId, goToVM, runFunction: 'assignTeam', teamsArray};
            const payloadString = JSON.stringify(newPayload);
            twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
          } else {
            let menuPrompt = 'Please press';

            teamsArray.forEach((team, i, array) => {
              menuPrompt += ` ${i + 1} for ${team.name}.`;
            });

            if (NUMBER_OF_MENUS === '1') {
              menuPrompt = `Welcome to Victor Ops Live Call Routing. ${menuPrompt}`;
            }

            const newPayload = {callerId, goToVM, runFunction: 'assignTeam', teamsArray};
            const payloadString = JSON.stringify(newPayload);
            twiml.gather({
              input: 'dtmf',
              timeout: 5,
              action: `/victorops?${qs.stringify({payloadString})}`,
              numDigits: teamsArray.length.toString().length
            }).say({VOICE}, `${menuPrompt} Press zero to repeat this menu.`);
            twiml.say({VOICE}, 'We did not receive a response. Goodbye.');
          }

          resolve(twiml);

          function buildManualTeamList(teamNumber, arrayOfTeams) {

            const key = 'TEAM_' + teamNumber;

            if (context[key] === undefined) {
              return arrayOfTeams;
            }

            const newArray = arrayOfTeams.slice();
            const name = context[key];
            const slug = context[key].toLowerCase().replace(/[^a-z0-9-~_]/g, '-');

            newArray.push({name, slug});

            return buildManualTeamList(teamNumber + 1, newArray);

          }

        }).catch(err => {

          console.log(err);
          twiml.say({VOICE}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
          
          resolve(twiml);

        });

    }

  });

}


function assignTeam(twiml, event, payload) {

  return new Promise((resolve, reject) => {

    const {Digits} = event;
    const {callerId, goToVM, VOICE} = payload;

    if (Digits === '0') {
      const newPayload = {callerId, goToVM, runFunction: 'teamsMenu'};
      const payloadString = JSON.stringify(newPayload);
      twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
    } else {
      let {teamsArray} = payload;

      if (goToVM === 'yes') {

        if (teamsArray.length === 1) {
          const newPayload = {callerId, goToVM, runFunction: 'leaveAMessage', teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
        } else if (Digits <= teamsArray.length) {
          teamsArray = [teamsArray[Digits - 1]];
          const newPayload = {callerId, goToVM, runFunction: 'leaveAMessage', teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
        } else {
          twiml.say({VOICE}, 'We did not receive a valid response. Goodbye.');
        }

      } else if (teamsArray.length === 1) {
        const newPayload = {callerId, goToVM, runFunction: 'buildOnCallList', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
      } else if (Digits <= teamsArray.length) {
        teamsArray = [teamsArray[Digits - 1]];
        const newPayload = {callerId, goToVM, runFunction: 'buildOnCallList', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
      } else {
        twiml.say({VOICE}, 'We did not receive a valid response. Goodbye.');
      }

    }

    resolve(twiml);

  });

}


function buildOnCallList(twiml, context, payload) {

  return new Promise((resolve, reject) => {

    const {API_HOST, API_ID, API_KEY, NUMBER_OF_MENUS} = context;
    const {callerId, teamsArray, VOICE} = payload;

    const escPolicyUrlArray = createEscPolicies(teamsArray[0].slug);
    const phoneNumberArray = escPolicyUrlArray.map(getPhoneNumbers);

    Promise.all(phoneNumberArray).then(phoneNumbers => {

      phoneNumbers = phoneNumbers.filter(phoneNumber => phoneNumber !== 'No one on-call');

      let message = `We are connecting you to the representative on-call for the ${teamsArray[0].name} team - Please hold`;

      if (NUMBER_OF_MENUS === '0') {
        message = `Welcome to Victor Ops Live Call Routing. ${message}`;
      }

      if (phoneNumbers.length === 0) {
        const newPayload = {phoneNumbers, runFunction: 'leaveAMessage', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
      } else {
        const newPayload = {callerId, firstCall: 'yes', phoneNumbers, runFunction: 'call', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.say({VOICE}, message);
        twiml.redirect(`/victorops?${qs.stringify({payloadString})}`);
      }

      resolve(twiml);

    }).catch(err => {

      console.log(err);
      twiml.say({VOICE}, 'There was an error retrieving the on-call phone numbers. Please try again.');
      
      resolve(twiml);

    });


    function createEscPolicies(teamSlug) {

      const onCallUrl = `https://${API_HOST}/api-public/v1/team/${teamSlug}/oncall/schedule?step=`;
      const arrayOfUrls = [];

      for (var i = 0; i <= 2; i++) {
        arrayOfUrls.push(`${onCallUrl}${i}`);
      }

      return arrayOfUrls;

    }


    function getPhoneNumbers(escPolicyUrl) {

      return new Promise((resolve, reject) => {

        got(escPolicyUrl,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-VO-Api-Key': API_KEY,
              'X-VO-Api-Id': API_ID
            }
          }).then(response => {

            const body = JSON.parse(response.body);
            const {overrides, schedule} = body;
            const onCallArray = [];

            schedule.forEach((currentValue, i, array) => {
              currentValue.rolls.forEach((roll, j, array) => {

                if (moment().isBetween(roll.change, roll.until)) {
                  let overrideExists = false;
                  let user;
                  overrides.forEach((override, k, array) => {

                    if (override.origOnCall === roll.onCall && moment().isBetween(override.start, override.end)) {
                      overrideExists = true;
                      user = override.overrideOnCall;
                    }

                  });

                  if (overrideExists === false) {
                    onCallArray.push(roll.onCall);
                  } else {
                    onCallArray.push(user);
                  }

                }
              
              });
            });

            if (onCallArray.length === 0) {
              return resolve('No one on-call');
            }

            const randomIndex = Math.floor(Math.random() * onCallArray.length);

            got(`https://${API_HOST}/api-public/v1/user/${onCallArray[randomIndex]}/contact-methods/phones`,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'X-VO-Api-Key': API_KEY,
                  'X-VO-Api-Id': API_ID
                }
              }).then(response => {

                const body = JSON.parse(response.body);

                if (body.contactMethods.length === 0) {
                  return resolve('No one on-call');
                } else {
                  return resolve({phone: body.contactMethods[0].value, user: onCallArray[randomIndex]});
                }

              }).catch(err => {

                console.log('err', err);
                return reject(err);

              });
                        
            }).catch(err => {

              console.log(err);
              return reject(err);

            });

      });

    }

  });

}


function call(twiml, context, event, payload) {

  return new Promise((resolve, reject) => {

    const {TWILIO_URL} = context;
    const {DialCallStatus, From} = event;
    const {callerId, firstCall, goToVM, phoneNumbers, teamsArray, VOICE} = payload;
    let {detailedLog, realCallerId} = payload;
    let phoneNumber;

    if (DialCallStatus === 'completed') {
      twiml.say({VOICE}, 'The other party has disconnected. Goodbye.');
    } else {

      if (firstCall !== 'yes') {
        twiml.say({VOICE}, 'Trying next on-call representative');
      } else {
        realCallerId = From;
      }

      if (phoneNumbers.length === 1) {
        phoneNumber = phoneNumbers[0];
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
        const newPayload = {callerId, goToVM, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'leaveAMessage', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.dial(
          {
            action: `/victorops?${qs.stringify({payloadString})}`,
            callerId
          }
        ).number(
          {
            url: `${TWILIO_URL}/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, phoneNumber, phoneNumbers, runFunction: 'isHuman', teamsArray})})}`,
            statusCallback: `${TWILIO_URL}/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, goToVM, phoneNumber, phoneNumbers, runFunction: 'postToVictorOps', teamsArray})})}`,
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      } else {
        phoneNumber = phoneNumbers[0];
        phoneNumbers.shift();
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;

        const newPayload = {callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'call', teamsArray};
        const payloadString = JSON.stringify(newPayload);
        twiml.dial(
          {
            action: `/victorops?${qs.stringify({payloadString})}`,
            callerId
          }
        ).number(
          {
            url: `${TWILIO_URL}/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'isHuman', teamsArray})})}`,
            statusCallback: `${TWILIO_URL}/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'postToVictorOps', teamsArray})})}`,
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      }

    }

    resolve(twiml);

  });

}


function isHuman(twiml, event, payload) {

  return new Promise((resolve, reject) => {

    const {TWILIO_URL} = context;
    const {Digits} = event;
    const {detailedLog, phoneNumber, phoneNumbers, realCallerId, teamsArray, VOICE} = payload;

    if (Digits === undefined) {
      const newPayload = {detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'isHuman', teamsArray};
      const payloadString = JSON.stringify(newPayload);
      twiml.gather({
        input: 'dtmf',
        timeout: 5,
        action: `/victorops?${qs.stringify({payloadString})}`,
        numDigits: 1
      }).say({VOICE}, 'This is Victor Ops Live Call Routing. Press any key to connect.');
      twiml.say({VOICE}, 'We did not receive a response. Goodbye.');
      twiml.hangup();
    } else {
      const newPayload = {callAnsweredByHuman: 'yes', detailedLog, phoneNumber, phoneNumbers, realCallerId, runFunction: 'postToVictorOps', teamsArray};
      const payloadString = JSON.stringify(newPayload);
      twiml.say({VOICE}, 'You are now connected.');
      twiml.redirect(`${TWILIO_URL}/victorops?${qs.stringify({payloadString})}`);
    }

    resolve(twiml);

  });

}


function leaveAMessage(twiml, event, payload) {

  return new Promise((resolve, reject) => {

    const {DialCallStatus} = event;
    const {callerId, detailedLog, goToVM, teamsArray, sayGoodbye, VOICE} = payload;

    const newPayload = {detailedLog, teamsArray};
    const payloadString = JSON.stringify(newPayload);

    if (DialCallStatus === 'completed') {
      twiml.say({VOICE}, 'The other party has disconnected. Goodbye.');
    } else if (sayGoodbye === 'yes') {
      twiml.say({VOICE}, 'Twilio will try to transcribe your message and create an incident in Victor Ops. Goodbye.');
    } else {
      let message = `Please leave a message for the ${teamsArray[0].name} team and hang up when you are finished.`

      if (goToVM !== 'yes') {
        message = `We were unable to reach an on-call representative. ${message}`;
      }

      twiml.say({VOICE}, message);
      twiml.record({
          transcribe: true,
          transcribeCallback: `/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, goToVM, runFunction: 'postToVictorOps', teamsArray})})}`,
          timeout: 10,
          action: `/victorops?${qs.stringify({payloadString: JSON.stringify({callerId, detailedLog, runFunction: 'leaveAMessage', sayGoodbye: 'yes', teamsArray})})}`
        });
    }

    resolve(twiml);

  });

}


function postToVictorOps(event, context, payload) {

  return new Promise((resolve, reject) => {

    const {ALERT_HOST, REST_ENDPOINT_API_KEY} = context;
    const {CallSid, CallStatus, CallDuration, TranscriptionStatus, TranscriptionText} = event;
    const {callAnsweredByHuman, detailedLog, goToVM, phoneNumber, phoneNumbers, realCallerId, teamsArray} = payload;

    const alert = {
      monitoring_tool: 'Twilio',
      entity_id: CallSid,
      entity_display_name: 'Twilio Live Call Routing Details'
    };

    if (TranscriptionText !== undefined && TranscriptionText !== '') {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
      alert.state_message = `Transcribed message from Twilio:\n${TranscriptionText}${detailedLog || ''}`;
    } else if (TranscriptionText !== undefined) {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
      alert.state_message = `Twilio was unable to transcribe message.${detailedLog || ''}`;
    } else if (callAnsweredByHuman === 'yes') {
      alert.message_type = 'acknowledgement';
      alert.state_message = `${phoneNumber.user} answered a call from ${realCallerId}.${detailedLog}`;
      alert.ack_author = phoneNumbers[0].user;
    } else if (CallStatus === 'completed' && TranscriptionStatus !== 'failed') {
      alert.message_type = 'recovery';
      alert.state_message = `${phoneNumber.user} answered a call from ${realCallerId} that lasted ${CallDuration} seconds.${detailedLog}`;
      alert.ack_author = phoneNumbers[0].user;
    } else {
      
      resolve('');
      
      return;
    }

    got.post(`https://${ALERT_HOST}/integrations/generic/20131114/alert/${REST_ENDPOINT_API_KEY}/${teamsArray[0].slug}`,
      {
        json: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(alert)
      }
    ).then(response => {

      resolve('');

    }).catch(err => {

      console.log(err);
      
      resolve('');

    });

  });

}
