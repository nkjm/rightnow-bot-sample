'use strict';

let debug = require("debug")("skill");

/*
** Just reply the text response provided from api.ai.
*/
module.exports = class SkillSimpleResponse {
    finish(bot, bot_event, context){
        debug(`Going to reply "${context.intent.fulfillment.speech}".`);
        let messages = [{
            text: context.intent.fulfillment.speech
        }];
        return bot.reply(bot_event, messages);
    }
};
