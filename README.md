# SharePoint Embedded for Visual Studio Code (Preview)
The SharePoint Embedded Visual Studio Code extension helps developers get started with [SharePoint Embedded](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/overview) application development. With the extension, developers can:

1. Create and configure Azure Entra app registrations for use with SharePoint Embedded
1. Create and manage [free trial container types](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/containertypes#sharepoint-embedded-trial-container-types)
1. Create additional guest apps on a [free trial container type](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/containertypes#sharepoint-embedded-trial-container-types)
1. Load one of the [sample apps](https://github.com/microsoft/SharePoint-Embedded-Samples) and auto-populate its runtime configuration
1. Export Container Type and Azure Entra app settings to a Postman Environment file for use with the [SharePoint Embedded Postman Collection](https://github.com/microsoft/SharePoint-Embedded-Samples/tree/main/Postman)

## Getting Started

### Sign In
In order to use this extension, you'll need to sign into a Microsoft 365 tenant with an administrator account. 

![Sign in](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/636d45f9-5912-4e2c-9a50-8f5efa472638)

If you don't have administrator access to a Microsoft 365 tenant, [get your own tenant with the Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program).

### Create a Free Trial Container Type
Once you've signed in, the first (and only) thing to do next is to create a [free trial container type](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/containertypes#sharepoint-embedded-trial-container-types). A free trial container type lets you get started calling SharePoint Embedded APIs and building a proof-of-concept application using SharePoint Embedded. 

![Create Free Trial Container Type](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/a8186b2b-bdf9-400b-820b-2e6ebe51d393)

#### Create an Azure Entra (AD) App
Every container type is owned by an Azure Entra (AD) application. The first step when creating a free trial container type is to create a new or select an existing Azure Entra application as the owning application. You can either specify the name of your new application or pick one of your existing applications. 

![Create App](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/944ecf1b-491c-4e5c-b887-73a5d709e9c5)

Note that if you choose an existing application, the extension will update that app's configuration settings in order for it to work with both SharePoint Embedded and this extension. Doing this is NOT recommended on production applications. 


#### Name your Free Trial Container Type
Once you have an Azure Entra application, the last step is to provide a name for your new free trial container type

![Name Container Type](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/f465d36e-57e8-472a-9d10-7374a28b24b1)

### Load Sample App
With a free trial container type created, you can use the extension to load one of the SharePoint Embedded sample apps and automatically populate the runtime configuration file with the details of your Azure Entra app and container type. This allows you to immediately run the sample app on your local machine. 

![Load Sample App](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/da40cd67-83b3-4da9-b743-159edd2802fa)

### Export Postman Environment
The [SharePoint Embedded Postman Collection](https://github.com/microsoft/SharePoint-Embedded-Samples/tree/main/Postman) allows you to explore and call the SharePoint Embedded APIs. The Collection requires an environment file with variables used for authentication and various identifiers. This extension automates the generation of this populated environment file so you can import it into Postman and immediately call the SharePoint Embedded APIs. 

![Export Postman Environment](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/a549866d-55e0-4a25-b173-fc532cc7b49e)

![Postman Import](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/06884e97-7a4c-41ea-8c19-c0eecfd2e624)

### Add a Guest App to your Free Trial Container Type
You can use the extension to add one or more guest apps on your existing free trial container type. Guest apps can be used to create different applications that have access to the same set of Containers. For example, you might have one app that delivers your Web experiences, another for mobile experiences, and another for background processing. You can specify both the delegated and application permissions on each guest application you create. 

![Guest App Permissions](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/assets/108372230/d3394cf6-b174-4c07-8cca-fe742cade70b)


## Contributing
This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit https://cla.microsoft.com.

* [Submit bugs and feature requests](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/issues)
* [Review source code changes](https://github.com/microsoft/SharePoint-Embedded-VS-Code-Extension/pulls)
* Review the documentation and make pull requests for anything from typos to new features

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

## Telemetry
The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at [Microsoft Privacy Statement](https://go.microsoft.com/fwlink/?LinkID=824704). You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

### Telemetry Configuration
Telemetry collection is on by default. To opt out, please set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).


## Reporting security issues
Give security researchers information on how to privately report security vulnerabilities found in your open-source project. See more details [Reporting security issues](https://docs.opensource.microsoft.com/content/releasing/security.html).

## Code of conduct
See [Microsoft Open Source code of conduct](https://opensource.microsoft.com/codeofconduct).

## Trademark
This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.

## License
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the [MIT](LICENSE) license.