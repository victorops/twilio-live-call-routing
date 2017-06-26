const qs = require('qs');
const got = require('got');
const moment = require('moment');


exports.handler = function(context, event, callback) {

  const {API_ID, API_KEY, REST_ENDPOINT_API_KEY, TWILIO_URL, NUMBER_OF_MENUS} = context;
  const {payloadString, runFunction, To} = event;
  const payload = payloadString === undefined ? undefined : JSON.parse(payloadString);
  let {voice} = context;
  voice = (voice === 'alice' || voice === 'man') ? voice : 'woman';
  let {callerId} = event;
  callerId = callerId === undefined ? To : callerId;
  let entryFunction;

  let twiml = new Twilio.twiml.VoiceResponse();

  main().then(result => callback(null, result)).catch(err => console.log(err));

  function main() {

    if (runFunction === undefined) {
      switch (NUMBER_OF_MENUS) {
        case '0':
        case '1':
          entryFunction = teamsMenu;
          break;
        default:
          entryFunction = callOrMessage;
          break;
      }
    }

    switch (runFunction) {
      case 'teamsMenu':
        return teamsMenu();
        break;
      case 'assignTeam':
        return assignTeam();
        break;
      case 'buildOnCallList':
        return buildOnCallList();
        break;
      case 'call':
        return call();
        break;
      case 'leaveAMessage':
        return leaveAMessage();
        break;
      case 'postToVictorOps':
        return postToVictorOps();
        break;
      default:
        return entryFunction();
        break;
    }

  }


  function callOrMessage() {

    return new Promise((resolve, reject) => {

      twiml.gather({
        input: 'dtmf',
        timeout: 10,
        action: `/victorops?${qs.stringify({runFunction: 'teamsMenu', callerId})}`,
        numDigits: 1
      }).say({voice}, 'Welcome to Victor Ops Live Call Routing. Please press 1 to reach an on-call representative or press 2 to leave a message. Press zero to repeat this menu.');
      twiml.say({voice}, 'We did not receive a response. Goodbye.');
      
      resolve(twiml);

    });

  }


  function teamsMenu() {

    return new Promise((resolve, reject) => {

      const {Digits} = event;
      let {goToVM} = event;

      if (Digits === '0') {
        twiml.redirect(`/victorops?${qs.stringify({callerId})}`);
        resolve(twiml);
      } else {

        got('https://api.victorops.com/api-public/v1/team',
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

            if (context.Team1 === undefined) {
              teamsArray = JSON.parse(response.body).map(team => {return {name: team.name, slug: team.slug};});
            } else {
              teamsArray = buildManualTeamList(1, []);
            }

            if (teamsArray.length === 0) {
              twiml.say({voice}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
            } else if (teamsArray.length === 1 || NUMBER_OF_MENUS === '0') {
              teamsArray = [teamsArray[0]];
              const newPayload = {teamsArray};
              const payloadString = JSON.stringify(newPayload);
              twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'assignTeam', goToVM, callerId})}`);
            } else {
              let menuPrompt = 'Please press';

              teamsArray.forEach((team, i, array) => {
                menuPrompt += ` ${i + 1} for ${team.name}.`;
              });

              const newPayload = {teamsArray};
              const payloadString = JSON.stringify(newPayload);
              twiml.gather({
                input: 'dtmf',
                timeout: 5,
                action: `/victorops?${qs.stringify({payloadString, runFunction: 'assignTeam', goToVM, callerId})}`,
                numDigits: teamsArray.length.toString().length
              }).say({voice}, `${menuPrompt} Press zero to repeat this menu.`);
              twiml.say({voice}, 'We did not receive a response. Goodbye.');
            }

            resolve(twiml);

            function buildManualTeamList(teamNumber, arrayOfTeams) {

              const key = 'Team' + teamNumber;

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
            twiml.say({voice}, 'There was an error retrieving the list of teams for your organization. Goodbye.');
            
            resolve(twiml);

          });

      }

    });

  }


  function assignTeam() {

    return new Promise((resolve, reject) => {

      const {Digits, goToVM} = event;

      if (Digits === '0') {
        twiml.redirect(`/victorops?${qs.stringify({runFunction: 'teamsMenu', goToVM, callerId})}`);
      } else {
        let {teamsArray} = payload;

        if (goToVM === 'yes') {

          if (teamsArray.length === 1) {
            const newPayload = {teamsArray};
            const payloadString = JSON.stringify(newPayload);
            twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'leaveAMessage', goToVM, callerId})}`);
          } else if (Digits <= teamsArray.length) {
            teamsArray = [teamsArray[Digits - 1]];
            const newPayload = {teamsArray};
            const payloadString = JSON.stringify(newPayload);
            twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'leaveAMessage', goToVM, callerId})}`);
          } else {
            twiml.say({voice}, 'We did not receive a valid response. Goodbye.');
          }

        } else if (teamsArray.length === 1) {
          const newPayload = {teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'buildOnCallList', goToVM, callerId})}`);
        } else if (Digits <= teamsArray.length) {
          teamsArray = [teamsArray[Digits - 1]];
          const newPayload = {teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'buildOnCallList', goToVM, callerId})}`);
        } else {
          twiml.say({voice}, 'We did not receive a valid response. Goodbye.');
        }

      }

      resolve(twiml);

    });

  }


  function buildOnCallList() {

    return new Promise((resolve, reject) => {

      const {teamsArray} = payload;
      const escPolicyUrlArray = createEscPolicies(teamsArray[0].slug);
      const phoneNumberArray = escPolicyUrlArray.map(getPhoneNumbers);

      Promise.all(phoneNumberArray).then(phoneNumbers => {

        phoneNumbers = phoneNumbers.filter(phoneNumber => phoneNumber !== 'No one on-call');

        const victorOpsData = {phoneNumbers: [{phone: '+1 303-638-4326', user: 'Bones'}, {phone: '+1 720-308-6554', user: 'Hoshi Sato'}]}; //Dev override, remove to go live

        phoneNumbers = victorOpsData.phoneNumbers; //Dev override, remove to go live
        const newPayload = {phoneNumbers, teamsArray};
        const payloadString = JSON.stringify(newPayload);

        if (phoneNumbers.length === 0) {
          twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'leaveAMessage'})}`);
        } else {
          twiml.say({voice}, `We are connecting you to the representative on-call for the ${teamsArray[0].name} team - Please hold`);
          twiml.redirect(`/victorops?${qs.stringify({payloadString, runFunction: 'call', firstCall: 'true', callerId})}`);
        }

        resolve(twiml);

      }).catch(err => {

        console.log(err);
        twiml.say({voice}, 'There was an error retrieving the on-call phone numbers. Please try again.');
        
        resolve(twiml);

      });


      function createEscPolicies(teamSlug) {

        const onCallUrl = `https://api.victorops.com/api-public/v1/team/${teamSlug}/oncall/schedule?step=`;
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
              const schedule = body.schedule;
              const onCallArray = [];

              schedule.forEach((currentValue, i, array) => { // Need to add logic for overrides
                currentValue.rolls.forEach((roll, j, array) => {

                  if (moment().isBetween(roll.change, roll.until)) {
                    onCallArray.push(roll.onCall);
                  }
                
                });
              });

              if (onCallArray.length === 0) {
                return resolve('No one on-call');
              }

              const randomIndex = Math.floor(Math.random() * onCallArray.length);

              got(`https://api.victorops.com/api-public/v1/user/${onCallArray[randomIndex]}/contact-methods/phones`,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    'X-VO-Api-Key': API_KEY,
                    'X-VO-Api-Id': API_ID
                  }
                }).then(response => {

                  const body = JSON.parse(response.body);
                  return resolve({phone: body.contactMethods[0].value, user: onCallArray[randomIndex]});

                }).catch(err => {

                  console.log(err);
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


  function call() {

    return new Promise((resolve, reject) => {

      const {DialCallStatus, firstCall, From, goToVM} = event;
      let {detailedLog} = payload;
      const {phoneNumbers, teamsArray} = payload;
      let phoneNumber;

      if (DialCallStatus === 'completed') {
        twiml.say({voice}, 'The other party has disconnected. Goodbye.')
      } else {

        if (firstCall !== 'true') {
          twiml.say({voice}, 'Trying next on-call representative');
        }

        if (phoneNumbers.length === 1) {
          phoneNumber = phoneNumbers[0];
          detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
          const newPayload = {detailedLog, teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.dial(
            {
              action: `/victorops?${qs.stringify({payloadString, runFunction: 'leaveAMessage', goToVM, callerId})}`,
              callerId
            }
          ).number(
            {
              statusCallback: `${TWILIO_URL}/victorops?${qs.stringify({payloadString, runFunction: 'postToVictorOps', goToVM, callerId})}`,
              statusCallbackEvent: 'answered completed'
            },
            phoneNumber.phone
          );
        } else {
          phoneNumber = phoneNumbers[0];
          phoneNumbers.shift();
          detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
          const newPayload = {detailedLog, phoneNumbers, teamsArray};
          const payloadString = JSON.stringify(newPayload);
          twiml.dial(
            {
              action: `/victorops?${qs.stringify({payloadString, runFunction: 'call', callerId})}`,
              callerId
            }
          ).number(
            {
              statusCallback: `${TWILIO_URL}/victorops?${qs.stringify({payloadString, runFunction: 'postToVictorOps', callerId})}`,
              statusCallbackEvent: 'answered completed'
            },
            phoneNumber.phone
          );
        }

      }

      resolve(twiml);

    });

  }


  function leaveAMessage() {

    return new Promise((resolve, reject) => {

      const {goToVM, sayGoodbye} = event;
      const {detailedLog, teamsArray} = payload;
      const newPayload = {detailedLog, teamsArray};
      const payloadString = JSON.stringify(newPayload);

      if (sayGoodbye === 'yes') {
        twiml.say({voice}, 'Twilio will try to transcribe your message and create an incident in Victor Ops. Goodbye.'); //No-noise = no incident; noise-but-not-transcribable = incident, twilio unable to transcribe; transcribed = incendent with transcription;
      } else {
        let message = `Please leave a message for the ${teamsArray[0].name} team and hang up when you are finished.`

        if (goToVM !== 'yes') {
          message = `We were unable to reach an on-call representative. ${message}`;
        }

        twiml.say({voice}, message);
        twiml.record({
            transcribe: true,
            transcribeCallback: `/victorops?${qs.stringify({payloadString, runFunction: 'postToVictorOps', callerId, goToVM})}`,
            timeout: 10,
            action: `/victorops?${qs.stringify({payloadString, runFunction: 'leaveAMessage', callerId, sayGoodbye: 'yes'})}`
          });
      }

      resolve(twiml);

    });

  }


  function postToVictorOps() {

    return new Promise((resolve, reject) => {

      const {detailedLog, phoneNumbers, teamsArray} = payload;
      const {CallSid, CallStatus, CallDuration, From, goToVM, TranscriptionStatus, TranscriptionText} = event;

      const alert = {
        monitoring_tool: 'Twilio',
        entity_id: CallSid,
        entity_display_name: 'Twilio Live Call Routing Details'
      };

      if (TranscriptionText !== undefined && TranscriptionText !== '') {
        alert.message_type = 'critical';
        alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
        alert.state_message = `Transcribed message from Twilio:\n${TranscriptionText}${detailedLog}`;
      } else if (TranscriptionText !== undefined) {
        alert.message_type = 'critical';
        alert.entity_display_name = goToVM === 'yes' ? `Twilio: message left for the ${teamsArray[0].name} team` : `Twilio: unable to reach on-call for ${teamsArray[0].name}`;
        alert.state_message = `Twilio was unable to transcribe message.${detailedLog}`;
      } else if (CallStatus === 'in-progress' && TranscriptionStatus !== 'failed') {
        alert.message_type = 'acknowledgement';
        alert.state_message = `${phoneNumbers[0].user} answered a call from ${From}.${detailedLog}`;
        alert.ack_author = phoneNumbers[0].user;
      } else if (CallStatus === 'completed' && TranscriptionStatus !== 'failed') {
        alert.message_type = 'recovery';
        alert.state_message = `${phoneNumbers[0].user} answered a call from ${From} that lasted ${CallDuration} seconds.${detailedLog}`;
        alert.ack_author = phoneNumbers[0].user;
      } else {
        
        resolve('OK');
        
        return;
      }

      got.post(`https://alert.victorops.com/integrations/generic/20131114/alert/${REST_ENDPOINT_API_KEY}/${teamsArray[0].slug}`,
        {
          json: true,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(alert)
        }
      ).then(response => {

        resolve('OK');

      }).catch(err => {

        console.log(err);
        
        resolve('OK');

      });

    });

  }

}
