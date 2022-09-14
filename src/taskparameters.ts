import * as core from '@actions/core';

import { IAuthorizer } from "azure-actions-webclient/Authorizer/IAuthorizer";

import fs = require('fs');
  
export class TaskParameters {
    private static taskparams: TaskParameters;
    private _endpoint: IAuthorizer;

    // Required basic parameters
    private _resourceGroup: string;
    private _containerAppName: string;
    private _imageName: string;
    private _commitHash: string;
    private _subscriptionId: string;

    // Optional Dapr parameters
    private _daprEnabled: boolean;
    private _daprAppPort: number;
    private _daprAppProtocol: string;

    // Optional Ingress parameters
    private _ingressExternal: boolean;
    private _ingressTargetPort: number;
    private _ingressCustomDomains: any[]; 
    private _ingressTraffic: any[];

    // Optional scale parameters
    private _scaleMaxReplicas: number;
    private _scaleMinReplicas: number;
    private _scaleRules: any[];


    private constructor(endpoint: IAuthorizer) {

        this._endpoint = endpoint;
        this._subscriptionId = endpoint.subscriptionID;

        // Required basic parameters
        this._resourceGroup = core.getInput('resource-group', { required: true });
        this._containerAppName = core.getInput('name', { required: true });
        this._imageName = core.getInput('image', { required: true });
        this._commitHash = core.getInput('commit-hash', { required: true });

        // Optional Dapr parameters
        this._daprAppPort = parseInt(core.getInput('dapr-app-port', { required: false }));
        this._daprAppProtocol = core.getInput('dapr-app-protocol', { required: false });
        this._daprEnabled = core.getInput('dapr-enabled', { required: false }) == "true";

        // Optional ingress parameters
        this._ingressExternal = core.getInput('ingress-external', { required: false }) == "true";
        this._ingressTargetPort = parseInt(core.getInput('ingress-target-port', { required: false }));
        let ingressCustomDomainsJsonString = core.getInput('ingress-custom-domains-json', { required: false });
        this._ingressCustomDomains = ingressCustomDomainsJsonString == "" ? [] : JSON.parse(ingressCustomDomainsJsonString)
        let ingressTrafficJsonString = core.getInput('ingress-traffic-json', { required: false});
        this._ingressTraffic = ingressTrafficJsonString == "" ? [] : JSON.parse(ingressTrafficJsonString)

        // Optional scale parameters
        this._scaleMaxReplicas = parseInt(core.getInput('scale-max-replicas', { required: false }));
        this._scaleMinReplicas = parseInt(core.getInput('scale-min-replicas', { required: false }));
        let scaleRulesJsonString = core.getInput('scale-rules-json', { required: false });
        this._scaleRules = scaleRulesJsonString == "" ? [] : JSON.parse(scaleRulesJsonString)
    }

    // JSON Validation
    // TBD: Need to validate that the specific params for ingressDomains exist in the input json
    // TBD: Need to validate that the specific params for ingressTraffic exist in the input json
    // TBD: Need to validate that the specific params for scaleRules exist in the input json
    // TBD: Need to validate that the specific params for containersConfig like 'name' and 'image' exist in the input json

    public static getTaskParams(endpoint: IAuthorizer) {
        if(!this.taskparams) {
            this.taskparams = new TaskParameters(endpoint);
        }
        return this.taskparams;
    }

    // Required basic parameters
    public get resourceGroup() {
        return this._resourceGroup;
    }

    public get containerAppName() {
        return this._containerAppName;
    }

    public get imageName() {
        return this._imageName;
    }

    public get commitHash() {
        return this._commitHash;
    }

    public get subscriptionId() {
        return this._subscriptionId;
    }

    // Optional Dapr parameters
    public get daprAppPort() {
        return this._daprAppPort;
    }
    
    public get daprAppProtocol() {
        return this._daprAppProtocol;
    }

    public get daprEnabled() {
        return this._daprEnabled;
    }

    // Optional Ingress parameters
    public get ingressExternal(){
        return this._ingressExternal;
    }

    public get ingressTargetPort(){
        return this._ingressTargetPort;
    }

    public get ingressTraffic(){
        return this._ingressTraffic;
    }

    public get ingressCustomDomains(){
       return this._ingressCustomDomains;
    }

    // Optional scale parameters
    public get scaleMaxReplicas(){
        return this._scaleMaxReplicas;
    }

    public get scaleMinReplicas(){
        return this._scaleMinReplicas;
    }

    public get scaleRules(){
        return this._scaleRules;
    }
}