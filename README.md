# twilio-live-call-routing
Twilio Live Call Routing

## Getting Started

### Deploying to Production in Twilio

Setting up Live Call Routing for VictorOps is a quick process and highly configurable.

1. Sign up with [Twilio](https://www.twilio.com/) and buy a number.
2. Create a new function in [Twilio](https://www.twilio.com/) and paste in code which can be found [here](https://github.com/victorops/twilio-live-call-routing/blob/master/victorops-twilio.js).
3. Link your new function to the phone number you bought.
4. Configure environmental variables in [Twilio](https://www.twilio.com/).

We made a [VictorOps Knowledge Base article](https://help.victorops.com/knowledge-base/victorops-twilio-live-call-routing-integration/) to guide you through the steps.

### Development

To clone and run this application, you'll need [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
$ git clone https://github.com/victorops/twilio-live-call-routing

# Go into the repository
$ cd twilio-live-call-routing

# Install dependencies
$ npm install
```
#### Running the Tests

Testing uses [Mocha](https://mochajs.org/) and [Chai](http://chaijs.com/). From your command line:

```bash
# Go into the repository
$ cd twilio-live-call-routing

# Run the tests
$ npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Copyright

Copyright &copy; 2017 VictorOps, Inc.
