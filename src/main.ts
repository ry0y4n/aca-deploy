import * as core from "@actions/core";
import * as crypto from "crypto";
import fs from 'fs'
import YAML from 'yaml'
import { ContainerAppsAPIClient, ContainerApp } from "@azure/arm-appcontainers";
import { TokenCredential, DefaultAzureCredential } from "@azure/identity";
import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";
import { IAuthorizer } from "azure-actions-webclient/Authorizer/IAuthorizer";

import { TaskParameters } from "./taskparameters";

var prefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";

async function main() {

// Please refer to this sample code
// https://github.com/Azure/azure-sdk-for-js/blob/32c07776aa91c302fb2c90ba65e3bb4668b5a792/sdk/appcontainers/arm-appcontainers/samples-dev/containerAppsCreateOrUpdateSample.ts
  try {
    // Set user agent variable.
    let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
    let actionName = 'DeployAzureContainerApp';
    let userAgentString = (!!prefix ? `${prefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
    core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);
    let endpoint: IAuthorizer = await AuthorizerFactory.getAuthorizer();
    var taskParams = TaskParameters.getTaskParams(endpoint);
    let credential: TokenCredential = new DefaultAzureCredential()

    // TBD: Need to get subscriptionId not from taskParams, but from credential.
    console.log("Predeployment Steps Started");
    const client = new ContainerAppsAPIClient(credential, taskParams.subscriptionId);

    const currentAppProperty = await client.containerApps.get(taskParams.resourceGroup, taskParams.containerAppName);
    console.dir(currentAppProperty, {depth: null});

    // TBD: Remove key when there is key without value

    let traffic = [
      {
        revisionName: 'momosuke-container3--tmp2',
        weight: 0,
        latestRevision: false,
        label: 'production'
      },
      {
        revisionName: 'momosuke-container3--tmp',
        weight: 100,
        latestRevision: false
      }
    ]
    const ingresConfig: {
      external: boolean,
      targetPort?: number,
      traffic?: any[],
      customDomains?: any[]
    } = {
      external: currentAppProperty.configuration!.ingress!.external!, 
      targetPort: currentAppProperty.configuration!.ingress!.targetPort!, 
      traffic: traffic,
      customDomains: currentAppProperty.configuration!.ingress!.customDomains! || []
    }
    if (ingresConfig.traffic == undefined) {
      delete ingresConfig.traffic
    }

    // TBD: Remove key when there is key without value
    const scaleConfig: {
      maxReplicas: number,
      minReplicas: number,
      rules: any[]
    } = {
      maxReplicas: currentAppProperty.template!.scale!.maxReplicas!, 
      minReplicas: currentAppProperty.template!.scale!.minReplicas!, 
      rules: [{
        "name": 'httpscalingrule',
        "custom": {
          "type": 'http',
          "metadata": {
            "concurrentRequests": '50'
          }
        }
      }]
    }

    let networkConfig: {
      dapr: object,
      ingress?: object
    } = {
      dapr: currentAppProperty.configuration!.dapr!,
      ingress: ingresConfig
    }
    if (ingresConfig.external == false || ingresConfig.external == undefined) {
      delete networkConfig.ingress
    }

    // TBD: Find a way to get a value instead of json
    const containerConfig = [
      {
        "name": taskParams.containerAppName,
        "image": taskParams.imageName
      }
    ]

    let currentManagedEnvironmentId = currentAppProperty.managedEnvironmentId!
    let managedEnvironmentName = currentManagedEnvironmentId.substr(currentManagedEnvironmentId.lastIndexOf('/') + 1);

    const containerAppEnvelope: ContainerApp = {
      configuration: networkConfig,
      location: currentAppProperty.location,
      managedEnvironmentId:
        `/subscriptions/${taskParams.subscriptionId}/resourceGroups/${taskParams.resourceGroup}/providers/Microsoft.App/managedEnvironments/${managedEnvironmentName}`,
      template: {
        containers: containerConfig,
        scale: scaleConfig,
        revisionSuffix: "tmp2"
      }
    };
    console.dir(containerAppEnvelope, {depth: null})

    console.log("Deployment Step Started");

    let containerAppDeploymentResult = await client.containerApps.beginCreateOrUpdateAndWait(
      taskParams.resourceGroup,
      taskParams.containerAppName,
      containerAppEnvelope,
    );
    if (containerAppDeploymentResult.provisioningState == "Succeeded") {
      console.log("Deployment Succeeded");

      if (ingresConfig.external == true) {
        let appUrl = "http://"+containerAppDeploymentResult.latestRevisionFqdn+"/"
        core.setOutput("app-url", appUrl);
        console.log("Your App has been deployed at: "+appUrl);
      }
    } else {
      core.debug("Deployment Result: "+containerAppDeploymentResult);
      throw Error("Container Deployment Failed"+containerAppDeploymentResult);
    }
  }
  catch (error: string | any) {
    console.log("Deployment Failed with Error: " + error);
    core.setFailed(error);
  }
  finally {
    // Reset AZURE_HTTP_USER_AGENT.
    core.exportVariable('AZURE_HTTP_USER_AGENT', prefix);
  }
}

main();