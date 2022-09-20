import * as core from "@actions/core";
import * as crypto from "crypto";
import { ContainerAppsAPIClient, ContainerApp, TrafficWeight } from "@azure/arm-appcontainers";
import { TokenCredential, DefaultAzureCredential } from "@azure/identity";
import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";
import { IAuthorizer } from "azure-actions-webclient/Authorizer/IAuthorizer";

import { TaskParameters } from "./taskparameters";

var prefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";

async function main() {

  try {
    // Set user agent variable.
    let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
    let actionName = 'DeployAzureContainerApp';
    let userAgentString = (!!prefix ? `${prefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
    core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);

    let endpoint: IAuthorizer = await AuthorizerFactory.getAuthorizer();
    var taskParams = TaskParameters.getTaskParams(endpoint);
    let credential: TokenCredential = new DefaultAzureCredential()

    console.log("Predeployment Steps Started");
    const client = new ContainerAppsAPIClient(credential, taskParams.subscriptionId);

    const currentAppProperty = await client.containerApps.get(taskParams.resourceGroup, taskParams.containerAppName);

    if (taskParams.deactivateRevisionMode) {
      await deactivateRevision({
        client,
        resourceGroup: taskParams.resourceGroup,
        containerAppName: taskParams.containerAppName,
        traffic: currentAppProperty.configuration?.ingress?.traffic || [],
        revisionName: `${taskParams.containerAppName}--${taskParams.revisionNameSuffix}`,
      });
      return;
    }

    let traffics = [];
    currentAppProperty.configuration!.ingress!.traffic!.forEach((traffic: TrafficWeight) => {
      if (traffic.weight && traffic.weight > 0) {
        traffics.push(traffic);
      }
    });
    traffics.push({
      revisionName: `${taskParams.containerAppName}--${taskParams.revisionNameSuffix}`,
      weight: 0,
      latestRevision: false
    })

    const ingresConfig: {
      external: boolean,
      targetPort?: number,
      traffic?: any[],
      customDomains?: any[]
    } = {
      external: currentAppProperty.configuration!.ingress!.external!,
      targetPort: currentAppProperty.configuration!.ingress!.targetPort!,
      traffic: traffics,
      customDomains: currentAppProperty.configuration!.ingress!.customDomains! || []
    }

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
      ingress?: object,
      activeRevisionsMode?: string
    } = {
      dapr: currentAppProperty.configuration!.dapr!,
      ingress: ingresConfig,
      activeRevisionsMode: "Multiple"
    }
    if (ingresConfig.external == false || ingresConfig.external == undefined) {
      delete networkConfig.ingress
    }

    const containerConfig = [
      {
        "name": taskParams.containerAppName,
        "image": taskParams.imageName
      }
    ]

    const containerAppEnvelope: ContainerApp = {
      configuration: networkConfig,
      location: currentAppProperty.location,
      managedEnvironmentId: currentAppProperty.managedEnvironmentId,
      template: {
        containers: containerConfig,
        scale: scaleConfig,
        revisionSuffix: taskParams.revisionNameSuffix
      }
    };

    console.log("Deployment Step Started");
    console.dir(containerAppEnvelope, {depth: null})

    let containerAppDeploymentResult = await client.containerApps.beginCreateOrUpdateAndWait(
      taskParams.resourceGroup,
      taskParams.containerAppName,
      containerAppEnvelope,
    );

    if (containerAppDeploymentResult.provisioningState == "Succeeded") {
      console.log("Deployment Succeeded");

      if (ingresConfig.external == true) {
        let appUrl = "http://" + containerAppDeploymentResult.latestRevisionFqdn + "/"
        core.setOutput("app-url", appUrl);
        console.log("Your App has been deployed at: " + appUrl);
      }
    } else {
      core.debug("Deployment Result: " + containerAppDeploymentResult);
      throw Error("Container Deployment Failed" + containerAppDeploymentResult);
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

async function deactivateRevision(params: any) {
  const { client, resourceGroup, containerAppName, traffic, revisionName } = params;
  const targetRevisions = traffic.filter((r: any) => r.revisionName === revisionName);

  // Check traffic weight of the target revision
  if (targetRevisions.length > 0 && targetRevisions.reduce((prev: number, curr: any) => prev + curr.weight, 0) !== 0)
    throw new Error(`Traffic weight of revision ${revisionName} under container app ${containerAppName} is not 0. Set 0 to the traffic weight of the revision before deactivation.`);

  console.log("Deactivation Step Started");
  await client.containerAppsRevisions.deactivateRevision(resourceGroup, containerAppName, revisionName);
  console.log("Deactivation Step Succeeded");
}

main();