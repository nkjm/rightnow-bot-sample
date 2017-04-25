'use strict';

//let soap = require("strong-soap").soap;
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
const APP_API_ID = 'lgbt-father';
const APP_IP_ADDRESS = '10.0.0.0';

module.exports = class RightNow {
    static search_answer(question, product = null, category = null){
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
                        client.addSoapHeader(
                            {
                                ClientInfoHeader: {
                                    AppID : APP_API_ID
                                }
                            },         //soapHeader Object({rootName: {name: "value"}}) or strict xml-string
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
                        debug(`Interaction Id: ${session_token}`);

                        let smart_assistant_search_msg = {
                            SessionToken: session_token,
                            Body: question,
                            Subject: question
                        }
                        if (product || category){
                            smart_assistant_search_msg.ContentSearch = {
                                "$xml":""
                            };
                        }
                        if (product){
                            smart_assistant_search_msg.ContentSearch["$xml"] = `
                                <Filters xmlns="urn:knowledge.ws.rightnow.com/v1">
                                    <ContentFilterList xsi:type="ServiceProductContentFilter">
                                        <ServiceProduct>
                                            <Name xmlns="urn:base.ws.rightnow.com/v1">${product}</Name>
                                        </ServiceProduct>
                                    </ContentFilterList>
                                </Filters>`;
                        }
                        if (category){
                            smart_assistant_search_msg.ContentSearch["$xml"] += `
                                <Filters xmlns="urn:knowledge.ws.rightnow.com/v1">
                                    <ContentFilterList xsi:type="ServiceCategoryContentFilter">
                                        <ServiceCategory>
                                            <Name xmlns="urn:base.ws.rightnow.com/v1">${category}</Name>
                                        </ServiceCategory>
                                    </ContentFilterList>
                                </Filters>`;
                        }
                        smart_assistant_search_msg.Limit = 1;

                        debug("Going to perform GetSmartAssistantSearch. smart_assistant_search_msg is following.");
                        debug(smart_assistant_search_msg);
                        client.GetSmartAssistantSearch(smart_assistant_search_msg, function(err, result){
                            if (err){
                                debug("Failed to serach.");
                                debug(err);
                                return reject(err);
                            }

                            if (result.ContentListResponse.SummaryContents && result.ContentListResponse.SummaryContents.SummaryContentList){
                                debug("Got contents.");

                                // FOR TEST
                                //return resolve(result.ContentListResponse);

                                let content_id;
                                if(result.ContentListResponse.SummaryContents.SummaryContentList.length > 0){
                                    content_id = result.ContentListResponse.SummaryContents.SummaryContentList[0].ID.attributes.id;
                                } else {
                                    content_id = result.ContentListResponse.SummaryContents.SummaryContentList.ID.attributes.id;
                                }

                                let content_msg = {
                                    "$xml": `
                                        <SessionToken>${session_token}</SessionToken>
                                        <ContentTemplate xmlns:q1="urn:knowledge.ws.rightnow.com/v1" xsi:type="q1:AnswerContent">
                                            <ID xmlns="urn:base.ws.rightnow.com/v1" id="${content_id}"/>
                                            <q1:Categories xsi:nil="true"/>
                                            <q1:CommonAttachments xsi:nil="true"/>
                                            <q1:FileAttachments xsi:nil="true"/>
                                            <q1:Keywords xsi:nil="true"/>
                                            <q1:Products xsi:nil="true"/>
                                            <q1:Question xsi:nil="true"/>
                                            <q1:Solution xsi:nil="true"/>
                                            <q1:ValidNullFields xsi:nil="true"/>
                                        </ContentTemplate>`
                                }

                                debug("Getting full content.");
                                client.GetContent(content_msg, function(err, result){
                                    if (err){
                                        debug("Failed to get content.");
                                        debug(err);
                                        return reject(err);
                                    }
                                    let content;
                                    if (result.Content){
                                        debug("Got following full content.");
                                        debug(result.Content);
                                        content = result.Content;
                                    }
                                    if (product){
                                        let found = false;
                                        for (let NamedIDHierarchy of content.Products.NamedIDHierarchyList){
                                            if (NamedIDHierarchy.Name == product){
                                                found = true;
                                            }
                                        }
                                        if (!found){
                                            debug(`Got full content but product does not match.`);
                                            content = null;
                                        }
                                    }
                                    if (category){
                                        let found = false;
                                        for (let NamedIDHierarchy of content.Categories.NamedIDHierarchyList){
                                            if (NamedIDHierarchy.Name == category){
                                                found = true;
                                            }
                                        }
                                        if (!found){
                                            debug(`Got full content but category does not match.`);
                                            content = null;
                                        }
                                    }
                                    return resolve(content);
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
