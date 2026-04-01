
# Document Purpose
This PRD outlines the experience and technical requirements for a new 'storage explorer' feature that we will add to the SharePoint Embedded VS Code extension. 

# Overview
We will provide the ability to manage SharePoint Embedded containers and their content within the SharePoint Embedded VS Code extension. The intent is to provide developers the ability to see and manage the storage related to their SharePoint Embedded app. It's a lot like the Azure Storage Explorer tool that developers can use. 

# Use Cases
The SPE Storage Explorer will allow the developer to see and manage the containers and content of a specific SPE app on their local tenant. Multiple Storage Explorer instances can be instantiated, but each one is bound to a specific SPE app installation. You cannot open multiple instances for the same app. 

The explorer will provide a UI that is much like a 'file explorer', allowing the developer to navigate the app's containers, folders, and files. 

- Show a list of items at the current path in a typical 'file list view' interface. Could be a set of containers when at the root, or files and folders when looking within a container or sub-path within a container
- Navigate around the hierarchy in a typical 'file explorer' way with point and click into folders and up
- Provide a text-input for the navigation path with auto-complete
- CRUD folders and files
- Create a folder, providing a name
- Create an empty file, providing a name that includes the extension
- Delete a file or folder
- Rename a file or folder
- Open Office documents in Office Online (show in a web browser)
- Open Office documents in Office desktop (show in a web browser)
- Preview any type of file (show in a web browser)
- Upload one or many files. Handle large file uploads and provide the ability to see progress, pause/resume/retry, and cancel. 
- Download a file
- CRUD the metadata (fields) associated with a file or folder. Provide a nice experience where the user can see + edit the current fields and values, and add new fields+values chosen from the container columns
- Show a nice view of the versions associated with a file. Provide the ability to download or restore a version
- Show a nice view of the permissions associated with a file or folder. Provide the ability to update and delete existing permissions. Provide the ability to add a new permission. Provide the ability to create a sharing link. Give the user an auto-complete text-input that allows the selection of users or groups when requesting their input for a permission identity. 
- CRUD containers
- Show a nice view of the permissions associated with a container. Provide the ability to update and delete existing permissions. Provide the ability to add a new permission. Give the user an auto-complete text-input that allows the selection of users or groups when requesting their input for a permission identity. 
- Show a nice view of the columns associated with a container. Provide the ability to update and delete existing columns. Provide the ability to add a new column. 
- Show a nice view of the custom properties associated with a container. Provide the ability to update and delete an existing custom property. Provide the abilty to add a new custom property. 
- Show a nice view of files and folders in the recycle bin associated with a specific container. Provide the ability to restore or (permenantly) delete items in it. 
- Show a nice view of the containers in the top-level container recycle bin. Provide the ability to restore or (permenantly) delete containers from it. 


# Tech Design Considerations
The SPE Storage Explorer will be instantiated as a WebView on a 'ContainerTypeRegistration' level. A ContainerType represents a SharePoint Embedded Application. Container Types belong to a specific tenant and are a global 'definition' of a SharePoint Embedded app. When a Container Type is 'registered' on a specific tenant, we call that a 'ContainerTypeRegistration'. Containers live within a ContainerTypeRegistration. 

Here's the flow -- the user will trigger the "Open Storage Explorer" action (probably from the context menu) on a specific ContainerTypeRegistration. The extension will see if there is already a WebView panel opened against that specific Container Type registration -- if there is, it will show it; otherwise, it will instantiate a new WebView against that specific ContainerTypeRegistration. 

## Tech Stack
Here's an overview of the tech stack and patterns we'll use
- Use the VSCode WebView for each instance of our Storage Explorer: https://code.visualstudio.com/api/extension-guides/webview
- Storage Explorer will be React-based client app (running in the WebView iframe)
- Storage Explorer will be structured in a clean way with good separation between pages, components, models, and services

## Auth
The extension already manages authentication and has the required access token for the underlying APIs needed by the Storage Explorer. Since code cannot be called across the extension and WebView border directly, we will need to use message passing to either:
* Have the extension share the access token with the WebView, and the WebView will implement its own services to interact with the APIs it needs
OR
* Have the WebView pass command-style messages to the extension when it needs to call an API, and the extension will manage all API calls. 

We are going with the former approach -- sharing the access token with the WebView. To support this, the WebView should implement an auth service that will:
- Provide a method for the API service (Graph service) to get the current access token
- Listen for access token updates from the extension
- Recognize expired/invalid tokens and ask the extension for a refreshed one

Of course, the extension itself will need to implement the other side of that to support the WebView. 


# UI Design
Use Windows File Explorer or OSX Finder as your inspiration for how to layout the Storage Explorer view. Few things to note on that:

- Provide navigation affordances at the top. Let the user know which app+tenant they are exploring, provide an editable path input, a clickable breadcrumb path, refresh button, etc
- Provide a set of 'actions' for the selected item underneath the main top nav. New file, folder, uploade, rename, delete, etc. 
- Provide a tabular listing of content as the main content view. Table headings on top with Name, Date modified, Type, and Size as defaults. Let the user pick which columns to show and let them sort on it. You'll have to handle pagination. 
- Provide a collapsable panel on the left where you can show some of the item specific UI -- versions, metadata, permissions, etc

## UI Library
Use the Visual Studio Code - React UI Library (`npm i vscrui`) for all components where possible. These will automatically provide styles that match VS Code's look, feel, and current theme settings. 

## Icons
Use VS Code's built-in product icons for general purpose 'nouns' in our webview where it makes sense. Things like on buttons and stuff. https://code.visualstudio.com/api/references/icons-in-labels

For file icones, you should use VS Code's built-in file icons because it will automatically show the right thing based on the extension, and it will match the look and feel. https://code.visualstudio.com/api/extension-guides/file-icon-theme


## Context Menus
Use Context menus as described by the WebView documentation where appropriate. For example, we should have an ellipses (...) next to files/folders/containers in our explorer view that will open a context menu when clicked. That's a good way to group all of the actions the user can do with a file/folder/container. 

## Theming
Pay attention to the WebView documentation when it comes to theming. It's very important the the Storage Explorer matches the current them set in VS Code; dark mode, light mode, or high contrast mode in particular. Use CSS variables to achieve this. 
