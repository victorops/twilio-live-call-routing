const qs = require('qs');
const got = require('got');
const _ = require('lodash');


exports.handler = function(context, event, callback) {
    const { ROUTING_KEY, VICTOROPS_TWILIO_SERVICE_API_KEY } = context;
    console.log(`${ROUTING_KEY} ${VICTOROPS_TWILIO_SERVICE_API_KEY}`);

    var got = require('got');

    let twiml = new Twilio.twiml.MessagingResponse();
    twiml.message({ to: event.From }, 'Incident Created');

    var alert = {
        monitoring_tool: 'Twilio',
        message_type: 'critical',
        entity_display_name: `${event.Body}`,
        state_message: `From ${event.From} -- ${event.Body}`,
        entity_id: `${event.From}`
    };

    console.log(alert);

    got.post(`https://alert.victorops.com/integrations/generic/20131114/alert/${VICTOROPS_TWILIO_SERVICE_API_KEY}/${ROUTING_KEY}`, {
        body: alert,
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json'
        },
        json: true
    }).then(function(response) {
        console.log(response.body);
        callback(null, twiml);

    }).catch(function(error) {
        console.log(error);
        callback(error);
    });
};