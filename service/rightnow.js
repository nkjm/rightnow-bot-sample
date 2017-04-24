'use strict';

let soap = require("soap");
let memory = require("memory-cache");
let request = require('request');
let debug = require("debug")("service");
let Promise = require("bluebird");
let app_env = require("../environment_variables");

const RN_USER = app_env.RN_USER;
const RN_PASSWORD = app_env.RN_PASSWORD;
const RN_HOSTNAME = app_env.RN_HOSTNAME;
const RN_WSDL = app_env.RN_WSDL;
const SOAP_WSS_SECURITY = new soap.WSSecurity(RN_USER, RN_PASSWORD, {hasTimeStamp: false, hasTokenCreated: false});
const APP_API_ID = 'KF Operations';
const APP_IP_ADDRESS = '10.0.0.0';

module.exports = class RightNow {
    static search_answer(question){
        return new Promise((resolve, reject) => {

            let client = memory.get("rn_soap_client");
            let client_created;
            if (client){
                debug("Rightnow soap client found.");
                client_created = Promise.resolve(client);
            } else {
                debug("Going to create Rightnow soap client.");
                client_created = new Promise((resolve, reject) => {
                    soap.createClient(RN_WSDL, function(err, client) {
                        if (err || !client){
                            debug("Failed to create soap client.");
                            return reject("Failed to create soap client.");
                        }
                        debug("Rightnow soap client created.");

                        client.setSecurity(SOAP_WSS_SECURITY);
                        client.addSoapHeader({
                            ClientInfoHeader: {
                                AppID : APP_API_ID
                            }},         //soapHeader Object({rootName: {name: "value"}}) or strict xml-string
                            '',         //name Unknown parameter (it could just a empty string)
                            'rnm_v1',   //namespace prefix of xml namespace
                            ''          //xmlns URI
                        );
                        memory.put("rn_soap_client", client);
                        resolve(client);
                    });
                });
            }

            client_created.then(
                (response) => {
                    let client = response;
                    let options = {};
                    let session_token;
                    client.StartInteraction({
                        AppIdentifier: APP_API_ID,
                        UserIPAddress: APP_IP_ADDRESS
                    }, function(err, result){
                        if (err) {
                            debug("Failed to start interaction.");
                            return reject("Failed to start interaction.");
                        }
                        debug("Interaction started.");
                        session_token = result.SessionToken;
                        debug("Going to search '" + question + "'");
                        client.GetSmartAssistantSearch({
                            SessionToken: session_token,
                            Body: question,
                            Subject: question,
                            Limit: 1,
                            Filters: {
                                ContentFilterList: [{
                                    ServiceProduct: {
                                        Names: [{
                                            Language:{
                                                ID: {
                                                    id: "ja"
                                                }
                                            },
                                            LabelText:"LGBT",
                                        }]
                                    }
                                }]
                            }
                        }, function(err, result){
                            if (err){
                                debug("Failed to serach.");
                                debug(err);
                                debug(result);
                                return reject(err);
                            }

                            if (result.ContentListResponse.SummaryContents && result.ContentListResponse.SummaryContents.SummaryContentList){
                                debug("Got contents.");

                                let content_id;
                                if(result.ContentListResponse.SummaryContents.SummaryContentList.length > 0){
                                    content_id = result.ContentListResponse.SummaryContents.SummaryContentList[0].ID.attributes.id;
                                } else {
                                    content_id = result.ContentListResponse.SummaryContents.SummaryContentList.ID.attributes.id;
                                }

                                // Get full content using content id.
                                let url = "https://" + encodeURIComponent(RN_USER) + ":" + encodeURIComponent(RN_PASSWORD) + "@" + RN_HOSTNAME + "/services/rest/connect/latest/answers/" + content_id;
                                let headers = {
                                    "Content-Type": "application/json"
                                }
                                debug("Getting full content of " + content_id + ".");
                                request({
                                    method: "GET",
                                    url: url,
                                    headers: headers,
                                    json: true
                                }, function (error, response, body) {
                                    if (error){
                                        reject(error);
                                    }
                                    resolve(body);
                                });
                            } else {
                                // Contents not found.
                                debug("Contents not found.");
                                resolve();
                            }
                        }, options);
                    },
                    options);
                },
                (response) => {
                    debug("Failed to create soap client.");
                    reject("Failed to create soap client.");
                }
            );
        });
    }
}
