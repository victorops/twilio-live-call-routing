// ==========================================================================
// Copyright 2017 VictorOps, Inc.
// https://github.com/victorops/twilio-live-call-routing/blob/master/LICENSE
// ==========================================================================

const qs = require('qs');
const got = require('got');
const _ = require('lodash');

module.exports = {
  assignTeam,
  buildOnCallList,
  call,
  callOrMessage,
  handler,
  isHuman,
  leaveAMessage,
  main,
  postToVictorOps,
  teamsMenu
};

// Make changes to messages if you want to modify what is spoken during a call
// Message keys starting with 'vo' are the text that show up in VictorOps timeline alerts
function handler (context, event, callback) {
  const messages = {
    missingConfig: 'There is a missing configuration value. Please contact your administrator to fix the problem.',
    greeting: 'Welcome to Victor Ops Live Call Routing.',
    menu: 'Please press 1 to reach an on-call representative or press 2 to leave a message.',
    zeroToRepeat: 'Press zero to repeat this menu.',
    noResponse: 'We did not receive a response.',
    invalidResponse: 'We did not receive a valid response.',
    goodbye: 'Goodbye.',
    noTeamsError: 'There was an error retrieving the list of teams for your organization.',
    otherPartyDisconnect: 'The other party has disconnected.',
    attemptTranscription: 'Twilio will attempt to transcribe your message and create an incident in Victor Ops.',
    pressKeyToConnect: 'This is Victor Ops Live Call Routing. Press any key to connect.',
    errorGettingPhoneNumbers: 'There was an error retrieving the on-call phone numbers. Please try again.',
    nextOnCall: 'Trying next on-call representative.',
    connected: 'You are now connected.',
    noAnswer: 'We were unable to reach an on-call representative.',
    voicemail: (team) => `Please leave a message for the ${team} team and hang up when you are finished.'`,
    connecting: (team) => `We are connecting you to the representative on-call for the ${team} team - Please hold.`,
    voTwilioMessageDirect: (team) => `Twilio: message left for the ${team} team`,
    voTwilioMessageAfter: (team) => `Twilio: unable to reach on-call for the ${team} team`,
    voTwilioTransciption: (transcription, log) => `Transcribed message from Twilio:\n${transcription}${log || ''}`,
    voTwilioTransciptionFail: (log) => `Twilio was unable to transcribe message.${log || ''}`,
    voCallAnswered: (user, caller, log) => `${user} answered a call from ${caller}.${log}`,
    voCallCompleted: (user, caller, duration, log) => `${user} answered a call from ${caller} that lasted ${duration} seconds.${log}`
  };
  const {API_KEY, API_ID} = context;
  const {payloadString, To} = event;
  const payload = _.isUndefined(payloadString)
    ? {}
    : JSON.parse(payloadString);
  const {runFunction} = payload;
  let {ALERT_HOST, API_HOST, NUMBER_OF_MENUS, voice} = context;
  context.ALERT_HOST = _.isUndefined(ALERT_HOST)
    ? 'alert.victorops.com'
    : ALERT_HOST;
  context.API_HOST = _.isUndefined(API_HOST)
    ? 'api.victorops.com'
    : API_HOST;
  context.messages = messages;
  context.headers = {
    'Content-Type': 'application/json',
    'X-VO-Api-Key': API_KEY,
    'X-VO-Api-Id': API_ID
  };
  switch (NUMBER_OF_MENUS) {
    case '1':
      break;
    case '2':
      break;
    default:
      context.NUMBER_OF_MENUS = '0';
      break;
  }
  // Add 'voice' key in Twilio config to change how Twilio sounds [default = 'woman', 'man', 'alice']
  payload.voice = (voice === 'alice' || voice === 'man')
    ? voice
    : 'woman';
  let {callerId} = payload;
  payload.callerId = _.isUndefined(callerId)
    ? To
    : callerId;

  let twiml = new Twilio.twiml.VoiceResponse();

  if (requiredConfigsExist(context)) {
    main(twiml, context, event, payload)
    .then(result => callback(null, result))
    .catch(err => console.log(err));
  } else {
    twiml.say(
      {voice: payload.voice},
      context.messages.missingConfig
    );

    callback(null, twiml);
  }
}

// Checks that all required configuration values have been entered in Twilio configure
function requiredConfigsExist (context) {
  const {API_ID, API_KEY, REST_ENDPOINT_API_KEY, TWILIO_URL} = context;

  if (
    _.isUndefined(API_ID) ||
    _.isUndefined(API_KEY) ||
    _.isUndefined(REST_ENDPOINT_API_KEY) ||
    _.isUndefined(TWILIO_URL)
  ) {
    return false;
  } else {
    return true;
  }
}

// Routes to the appropriate function based on the value of 'runFunction'
function main (twiml, context, event, payload) {
  const {NUMBER_OF_MENUS} = context;
  const {runFunction} = payload;

  if (_.isUndefined(runFunction)) {
    switch (NUMBER_OF_MENUS) {
      case '1':
        return teamsMenu(twiml, context, event, payload);
        break;
      case '2':
        return callOrMessage(twiml, context, payload);
        break;
      default:
        return teamsMenu(twiml, context, event, payload);
        break;
    }
  }

  switch (runFunction) {
    case 'teamsMenu':
      return teamsMenu(twiml, context, event, payload);
      break;
    case 'assignTeam':
      return assignTeam(twiml, context, event, payload);
      break;
    case 'buildOnCallList':
      return buildOnCallList(twiml, context, payload);
      break;
    case 'call':
      return call(twiml, context, event, payload);
      break;
    case 'isHuman':
      return isHuman(twiml, context, event, payload);
      break;
    case 'leaveAMessage':
      return leaveAMessage(twiml, context, event, payload);
      break;
    case 'postToVictorOps':
      return postToVictorOps(event, context, payload);
      break;
    default:
      return new Promise((resolve, reject) => reject(new Error('No function was called.')));
      break;
  }
}

// Menu to choose to reach someone on-call or leave a message
function callOrMessage (twiml, context, payload) {
  return new Promise((resolve, reject) => {
    const {messages} = context;
    const {callerId, voice} = payload;

    twiml.gather(
      {
        input: 'dtmf',
        timeout: 10,
        action: generateCallbackURI(
          context,
          {
            callerId,
            fromCallorMessage: true,
            runFunction: 'teamsMenu'
          }
        ),
        numDigits: 1
      }
    )
    .say(
      {voice},
      `${messages.greeting} ${messages.menu} ${messages.zeroToRepeat}`
    );
    twiml.say(
      {voice},
      `${messages.noResponse} ${messages.goodbye}`
    );

    resolve(twiml);
  });
}

// Helper function to generate the callback URI with the required data
function generateCallbackURI (context, json) {
  const {TWILIO_URL} = context;
  const payloadString = JSON.stringify(json);

  return `${TWILIO_URL}/victorops?${qs.stringify({payloadString})}`;
}

// Menu to select team to contact for on-call or leaving a message
function teamsMenu (twiml, context, event, payload) {
  return new Promise((resolve, reject) => {
    const {API_HOST, headers, messages, NUMBER_OF_MENUS} = context;
    let {Digits} = event;
    Digits = parseInt(Digits);
    const {callerId, fromCallorMessage, voice} = payload;
    let {goToVM} = payload;

    // Repeats the call or message menu if caller pressed 0
    if (Digits === 0) {
      twiml.redirect(
        generateCallbackURI(
          context,
          {callerId}
        )
      );

      resolve(twiml);
    // Repeats the call or message menu if caller did not enter a valid response
    } else if (fromCallorMessage === true && Digits !== 1 && Digits !== 2) {
      twiml.say(
        {voice},
        `${messages.invalidResponse}`
      );
      twiml.redirect(
        generateCallbackURI(
          context,
          {callerId}
        )
      );

      resolve(twiml);
    } else {
      got(
        `https://${API_HOST}/api-public/v1/team`,
        {headers}
      )
      .then(response => {
        let teamsArray;

        if (Digits === 2) {
          goToVM = true;
        }

        // If Twilio configure has any keys starting with 'TEAM',
        // these teams will be used instead of pulling a list of teams from VictorOps
        if (_.isEmpty(buildManualTeamList(context))) {
          teamsArray = JSON.parse(response.body)
          .map(team => {
            return {
              name: team.name,
              slug: team.slug
            };
          });
        } else {
          teamsArray = buildManualTeamList(context);
        }

        // An error message is read and the call ends if there are no teams available
        if (teamsArray.length === 0) {
          twiml.say(
            {voice},
            `${messages.noTeamsError} ${messages.goodbye}`
          );
        // Automatically moves on to next step if there is only one team
        } else if (teamsArray.length === 1 || NUMBER_OF_MENUS === '0') {
          teamsArray = [teamsArray[0]];
          twiml.redirect(
            generateCallbackURI(
              context,
              {
                callerId,
                goToVM,
                runFunction: 'assignTeam',
                teamsArray
              }
            )
          );
        // Generates the menu of teams to prompt the caller to make a selection
        } else {
          let menuPrompt = 'Please press';

          teamsArray.forEach((team, i, array) => {
            menuPrompt += ` ${i + 1} for ${team.name}.`;
          });

          if (NUMBER_OF_MENUS === '1') {
            menuPrompt = `${messages.greeting} ${menuPrompt}`;
          }

          twiml.gather(
            {
              input: 'dtmf',
              timeout: 5,
              action: generateCallbackURI(
                context,
                {
                  callerId,
                  goToVM,
                  runFunction: 'assignTeam',
                  teamsArray
                }
              ),
              numDigits: teamsArray.length.toString().length
            }
          )
          .say(
            {voice},
            `${menuPrompt} ${messages.zeroToRepeat}`
          );
          // If no response is received from the caller, the call ends
          twiml.say(
            {voice},
            `${messages.noResponse} ${messages.goodbye}`
          );
        }

        resolve(twiml);
      })
      .catch(err => {
        console.log(err);
        twiml.say(
          {voice},
          `${messages.noTeamsError} ${messages.goodbye}`
        );

        resolve(twiml);
      });
    }
  });
}

// Creates a list of teams for the teamsMenu if there are any keys that begin with 'TEAM' in Twilio configure
function buildManualTeamList (context) {
  const arrayOfTeams = [];

  Object.keys(context).forEach((key) => {
    if (key.substring(0, 4).toLowerCase() === 'team') {
      const name = context[key];
      const slug = context[key].toLowerCase().replace(/[^a-z0-9-~_]/g, '-');

      arrayOfTeams.push(
        {
          name,
          slug
        }
      );
    }
  });

  return arrayOfTeams;
}

// Handles the caller's input and chooses the appropriate team
function assignTeam (twiml, context, event, payload) {
  return new Promise((resolve, reject) => {
    const {messages} = context;
    let {Digits} = event;
    Digits = parseInt(Digits);
    const {callerId, goToVM, voice} = payload;

    // Repeats the teams menu if caller pressed 0
    if (Digits === 0) {
      twiml.redirect(
        generateCallbackURI(
          context,
          {
            callerId,
            goToVM,
            runFunction: 'teamsMenu'
          }
        )
      );
    // If caller enters an invalid selection, the call ends
    } else if (isNaN(Digits)) {
      twiml.say(
        {voice},
        `${messages.invalidResponse} ${messages.goodbye}`
      );
    // Take the appropriate action based on call or message menu
    } else {
      let {teamsArray} = payload;

      // Take the caller to voicemail
      if (goToVM === true) {
        if (teamsArray.length === 1) {
          twiml.redirect(
            generateCallbackURI(
              context,
              {
                callerId,
                goToVM,
                runFunction: 'leaveAMessage',
                teamsArray
              }
            )
          );
        } else if (Digits <= teamsArray.length) {
          teamsArray = [teamsArray[Digits - 1]];
          twiml.redirect(
            generateCallbackURI(
              context,
              {
                callerId,
                goToVM,
                runFunction: 'leaveAMessage',
                teamsArray
              }
            )
          );
        // If the caller entered an invalid response, the call ends
        } else {
          twiml.say(
            {voice},
            `${messages.invalidResponse} ${messages.goodbye}`
          );
        }
      // Proceed to attempt to build a list of people on-call
      } else if (teamsArray.length === 1) {
        twiml.redirect(
          generateCallbackURI(
            context,
            {
              callerId,
              goToVM,
              runFunction: 'buildOnCallList',
              teamsArray
            }
          )
        );
      } else if (Digits <= teamsArray.length) {
        teamsArray = [teamsArray[Digits - 1]];
        twiml.redirect(
          generateCallbackURI(
            context,
            {
              callerId,
              goToVM,
              runFunction: 'buildOnCallList',
              teamsArray
            }
          )
        );
      // If the caller entered an invalid response, the call ends
      } else {
        twiml.say(
          {voice},
          `${messages.invalidResponse} ${messages.goodbye}`
        );
      }
    }

    resolve(twiml);
  });
}

// Generates a list of people on-call and their phone numbers
function buildOnCallList (twiml, context, payload) {
  return new Promise((resolve, reject) => {
    const {messages, NUMBER_OF_MENUS} = context;
    const {callerId, teamsArray, voice} = payload;

    // Creates a list of phone numbers based on the first 3 escalation policies
    const escPolicyUrlArray = createEscPolicies(context, teamsArray[0].slug);
    const phoneNumberArray = escPolicyUrlArray.map(url => getPhoneNumbers(context, url));

    Promise.all(phoneNumberArray)
    .then(phoneNumbers => {
      phoneNumbers = phoneNumbers.filter(phoneNumber => phoneNumber !== false);

      let message = messages.connecting(teamsArray[0].name);

      // Welcome message if caller has not heard any other menu
      if (NUMBER_OF_MENUS === '0') {
        message = `${messages.greeting} ${message}`;
      }

      // If there is no one on-call with a phone number, go to voicemail
      if (phoneNumbers.length === 0) {
        twiml.redirect(
          generateCallbackURI(
            context,
            {
              phoneNumbers,
              runFunction: 'leaveAMessage',
              teamsArray
            }
          )
        );
      // Move on to trying connect caller with people on-call
      } else {
        twiml.say(
          {voice},
          message
        );
        twiml.redirect(
          generateCallbackURI(
            context,
            {
              callerId,
              firstCall: true,
              phoneNumbers,
              runFunction: 'call',
              teamsArray
            }
          )
        );
      }

      resolve(twiml);
    })
    .catch(err => {
      console.log(err);
      twiml.say(
        {voice},
        `${messages.errorGettingPhoneNumbers}`
      );

      resolve(twiml);
    });
  });
}

// Helper function that generates a list of URI's from which to request data from VictorOps with
function createEscPolicies (context, teamSlug) {
  const {API_HOST} = context;
  const onCallUrl = `https://${API_HOST}/api-public/v1/team/${teamSlug}/oncall/schedule?step=`;
  const arrayOfUrls = [];

  for (let i = 0; i <= 2; i++) {
    arrayOfUrls.push(`${onCallUrl}${i}`);
  }

  return arrayOfUrls;
}

// Generates a list of phone numbers
// Randomly picks on person if there is more than one person on-call for an escalation policy
function getPhoneNumbers (context, escPolicyUrl) {
  return new Promise((resolve, reject) => {
    const {API_HOST, headers} = context;

    got(
      escPolicyUrl,
      {headers}
    )
    .then(response => {
      const body = JSON.parse(response.body);
      const {schedule} = body;
      const onCallArray = [];

      schedule.forEach((rotation, i, array) => {
        if (!(_.isUndefined(rotation.onCall))) {
          if (!(_.isUndefined(rotation.overrideOnCall))) {
            onCallArray.push(rotation.overrideOnCall);
          } else {
            onCallArray.push(rotation.onCall);
          }
        }
      });

      if (onCallArray.length === 0) {
        return resolve(false);
      }

      const randomIndex = Math.floor(Math.random() * onCallArray.length);

      got(
        `https://${API_HOST}/api-public/v1/user/${onCallArray[randomIndex]}/contact-methods/phones`,
        {headers}
      )
      .then(response => {
        const body = JSON.parse(response.body);

        if (body.contactMethods.length === 0) {
          return resolve(false);
        } else {
          return resolve(
            {
              phone: body.contactMethods[0].value,
              user: onCallArray[randomIndex]
            }
          );
        }
      })
      .catch(err => {
        console.log('err', err);

        return reject(err);
      });
    })
    .catch(err => {
      console.log(err);

      return reject(err);
    });
  });
}

// Connects caller to people on-call and builds a log of calls made
function call (twiml, context, event, payload) {
  return new Promise((resolve, reject) => {
    const {messages} = context;
    const {DialCallStatus, From} = event;
    const {callerId, firstCall, goToVM, phoneNumbers, teamsArray, voice} = payload;
    let {detailedLog, realCallerId} = payload;
    let phoneNumber;

    // Caller was connected to on-call person and call completed
    if (DialCallStatus === 'completed') {
      twiml.say(
        {voice},
        `${messages.otherPartyDisconnect} ${messages.goodbye}`
      );
    } else {
      if (firstCall !== true) {
        twiml.say(
          {voice},
          `${messages.nextOnCall}`
        );
      } else {
        realCallerId = From;
      }

      // Attempt to connect to last on-call person and go to voicemail if no answer
      if (phoneNumbers.length === 1) {
        phoneNumber = phoneNumbers[0];
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
        twiml.dial(
          {
            action: generateCallbackURI(
              context,
              {
                callerId,
                goToVM,
                detailedLog,
                phoneNumber,
                phoneNumbers,
                realCallerId,
                runFunction: 'leaveAMessage',
                teamsArray
              }
            ),
            callerId
          }
        )
        .number(
          {
            url: generateCallbackURI(
              context,
              {
                callerId,
                detailedLog,
                phoneNumber,
                phoneNumbers,
                runFunction: 'isHuman',
                teamsArray
              }
            ),
            statusCallback: generateCallbackURI(
              context,
              {
                callerId,
                detailedLog,
                goToVM,
                phoneNumber,
                phoneNumbers,
                runFunction: 'postToVictorOps',
                teamsArray
              }
            ),
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      // Attempt to connect to first on-call person and attempt to connect to next on-call person if no answer
      } else {
        phoneNumber = phoneNumbers[0];
        phoneNumbers.shift();
        detailedLog = `\n\n${From} calling ${phoneNumber.user}...${detailedLog || ''}`;
        twiml.dial(
          {
            action: generateCallbackURI(
              context,
              {
                callerId,
                detailedLog,
                phoneNumber,
                phoneNumbers,
                realCallerId,
                runFunction: 'call',
                teamsArray
              }
            ),
            callerId
          }
        )
        .number(
          {
            url: generateCallbackURI(
              context,
              {
                callerId,
                detailedLog,
                phoneNumber,
                phoneNumbers,
                realCallerId,
                runFunction: 'isHuman',
                teamsArray
              }
            ),
            statusCallback: generateCallbackURI(
              context,
              {
                callerId,
                detailedLog,
                phoneNumber,
                phoneNumbers,
                realCallerId,
                runFunction: 'postToVictorOps',
                teamsArray
              }
            ),
            statusCallbackEvent: 'completed'
          },
          phoneNumber.phone
        );
      }
    }

    resolve(twiml);
  });
}

// Asks called party for an input when they pick up the phone to differentiate between human and voicemail
function isHuman (twiml, context, event, payload) {
  return new Promise((resolve, reject) => {
    const {messages} = context;
    const {Digits} = event;
    const {detailedLog, phoneNumber, phoneNumbers, realCallerId, teamsArray, voice} = payload;

    if (_.isUndefined(Digits)) {
      twiml.gather(
        {
          input: 'dtmf',
          timeout: 5,
          action: generateCallbackURI(
            context,
            {
              detailedLog,
              phoneNumber,
              phoneNumbers,
              realCallerId,
              runFunction: 'isHuman',
              teamsArray
            }
          ),
          numDigits: 1
        }
      )
      .say(
        {voice},
        `${messages.pressKeyToConnect}`
      );
      twiml.say(
        {voice},
        `${messages.noResponse} ${messages.goodbye}`
      );
      twiml.hangup();
    } else {
      twiml.say(
        {voice},
        `${messages.connected}`
      );
      twiml.redirect(
        generateCallbackURI(
          context,
          {
            callAnsweredByHuman: true,
            detailedLog,
            phoneNumber,
            phoneNumbers,
            realCallerId,
            runFunction: 'postToVictorOps',
            teamsArray
          }
        )
      );
    }

    resolve(twiml);
  });
}

// Records caller's message and transcribes it
function leaveAMessage (twiml, context, event, payload) {
  return new Promise((resolve, reject) => {
    const {messages} = context;
    const {DialCallStatus} = event;
    const {callerId, detailedLog, goToVM, teamsArray, sayGoodbye, voice} = payload;

    // Caller was connected to on-call person and call completed 
    if (DialCallStatus === 'completed') {
      twiml.say(
        {voice},
        `${messages.otherPartyDisconnect} ${messages.goodbye}`
      );
    // If caller does not hang up after leaving message,
    // this message will play and then end the call
    } else if (sayGoodbye === true) {
      twiml.say(
        {voice},
        `${messages.attemptTranscription} ${messages.goodbye}`
      );
    // Play a message, record the caller's message, transcribe caller's message
    } else {
      let message = messages.voicemail(teamsArray[0].name);

      if (goToVM !== true) {
        message = `${messages.noAnswer} ${message}`;
      }

      twiml.say(
        {voice},
        message
      );
      twiml.record(
        {
          transcribe: true,
          transcribeCallback: generateCallbackURI(
            context,
            {
              callerId,
              detailedLog,
              goToVM,
              runFunction: 'postToVictorOps',
              teamsArray
            }
          ),
          timeout: 10,
          action: generateCallbackURI(
            context,
            {
              callerId,
              detailedLog,
              runFunction: 'leaveAMessage',
              sayGoodbye: true,
              teamsArray
            }
          )
        }
      );
    }

    resolve(twiml);
  });
}

// Posts information to VictorOps that generates alerts that show up in the timeline
function postToVictorOps (event, context, payload) {
  return new Promise((resolve, reject) => {
    const {ALERT_HOST, messages, REST_ENDPOINT_API_KEY} = context;
    const {CallSid, CallStatus, CallDuration, TranscriptionStatus, TranscriptionText} = event;
    const {callAnsweredByHuman, detailedLog, goToVM, phoneNumber, phoneNumbers, realCallerId, teamsArray} = payload;

    const alert = {
      monitoring_tool: 'Twilio',
      entity_id: CallSid,
      entity_display_name: 'Twilio Live Call Routing Details'
    };

    // Create an incident in VictorOps if Twilio was able to transcribe caller's message
    if (!(_.isUndefined(TranscriptionText)) && TranscriptionText !== '') {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === true
        ? messages.voTwilioMessageDirect(teamsArray[0].name)
        : messages.voTwilioMessageAfter(teamsArray[0].name);
      alert.state_message = messages.voTwilioTransciption(TranscriptionText, detailedLog);
    // Create an incident in VictorOps if Twilio was unable to transcribe caller's message
    } else if (!(_.isUndefined(TranscriptionText))) {
      alert.message_type = 'critical';
      alert.entity_display_name = goToVM === true
        ? messages.voTwilioMessageDirect(teamsArray[0].name)
        : messages.voTwilioMessageAfter(teamsArray[0].name);
      alert.state_message = messages.voTwilioTransciptionFail(detailedLog);
    // Create an 'Acknowledment' alert in VictorOps when caller is connected with on-call person
    } else if (callAnsweredByHuman === true) {
      alert.message_type = 'acknowledgement';
      alert.state_message = messages.voCallAnswered(phoneNumber.user, realCallerId, detailedLog);
      alert.ack_author = phoneNumbers[0].user;
    // Create a 'Recovery' alert in VictorOps when caller and on-call person complete their call
    } else if (CallStatus === 'completed' && TranscriptionStatus !== 'failed') {
      alert.message_type = 'recovery';
      alert.state_message = messages.voCallCompleted(phoneNumber.user, realCallerId, CallDuration, detailedLog);
      alert.ack_author = phoneNumbers[0].user;
    } else {
      resolve('');

      return;
    }

    got.post(
      `https://${ALERT_HOST}/integrations/generic/20131114/alert/${REST_ENDPOINT_API_KEY}/${teamsArray[0].slug}`,
      {
        json: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(alert)
      }
    )
    .then(response => {
      resolve('');
    })
    .catch(err => {
      console.log(err);

      resolve('');
    });
  });
}
