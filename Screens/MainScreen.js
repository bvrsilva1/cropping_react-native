import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Button,
  Image,
  Alert,
  TouchableHighlight,
  Platform
} from 'react-native';
import _ from 'lodash';

import Spinner from 'react-native-loading-spinner-overlay';

import ScanbotSDK, { Page, Point, MrzScannerConfiguration, BarcodeScannerConfiguration } from 'react-native-scanbot-sdk';

import { DemoScreens, DemoConstants } from '.';

class RowButton extends Component {
  render() {
    const {title, onPress} = this.props;
    return (
      <View style={styles.demoButtonPanel}>
        <Button
            title={title}
            onPress={onPress} />
      </View>
      );
  }
}

export default class MainScreen extends Component {

  constructor(props) {
    super(props);

    this.state = {
      pages: [],
      selectedPage: null,
      spinnerVisible: false,
      debugText: ""
    };
  }

  componentDidMount() {
    this.initializeSDK();
  }

  render() {
    return (
        <ScrollView onLayout={this.onLayout}>

          <Spinner visible={this.state.spinnerVisible}
                   textContent={"Processing ..."}
                   textStyle={{color: '#FFF'}}
                   cancelable={false} />

          <Text style={styles.instructions}>
            Example scanner - BasicBlock
          </Text>

          <RowButton
              title="Scan Document"
              onPress={this.startScanbotCameraButtonTapped}/>

          <RowButton
            title="Chose image from library"
            onPress={this.pickImageTapped}/>

          <View style={styles.container}>
            {this.renderPickedImages()}
          </View>

          <View style={styles.container}>
            {this.renderDocumentImage()}
          </View>

          {
            this.state.pages.length == 0 && <Text style={styles.infoblock}>
              Scan some images or import from Photo Library.
            </Text>
          }

          <View style={{flex: 1, flexDirection: 'row', justifyContent: 'space-between', margin: 10}}>
            <Button
                title="Rotate counter clock wise"
                onPress={this.rotateImageCCWButtonTapped} />
            <Button
                title="Rotate clock wise"
                onPress={this.rotateImageCWButtonTapped} />
          </View>

          <RowButton
            title="Crop image"
            onPress={this.startScanbotCroppingButtonTapped}/>

          <RowButton
              title="Image filter"
              onPress={this.gotoImageFilterPage}/>

          <RowButton
            title="Create PDF"
            onPress={this.createPDFButtonTapped} />

          <Text style={styles.debugOutputHeader}>
            {'DEBUG OUTPUT:'}
          </Text>
          <Text style={styles.debugOutputContent}>
            {this.state.debugText}
          </Text>

        </ScrollView>
    );
  }

  async initializeSDK() {
    let options = {
      licenseKey: DemoConstants.scanbotLicenseKey,
      loggingEnabled: DemoConstants.loggingEnabled,
      storageImageFormat: DemoConstants.imageFormat,
      storageImageQuality: DemoConstants.imageQuality
    };
    try {
      const result = await ScanbotSDK.initializeSDK(options);
      this.debugLog('initializeSDK result: ' + JSON.stringify(result));
    } catch (ex) {
      this.debugLog('initializeSDK error: ' + JSON.stringify(ex.error));
    }
  }

  isLicenseValidButtonTapped = async () => {
    const result = await ScanbotSDK.isLicenseValid();
    this.debugLog('isLicenseValid result: ' + JSON.stringify(result));
  };

  onLayout = evt => {
    const {width} = evt.nativeEvent.layout;
    this.setState({width});
  };

  startScanbotCameraButtonTapped = async () => {
    const result = await ScanbotSDK.UI.startDocumentScanner({
      // Customize colors, text resources, etc..
      polygonColor: '#00ffff',
      cameraPreviewMode: 'FIT_IN'
    });

    this.debugLog(`DocumentScanner result: ${JSON.stringify(result)}`);

    if (result.status === "OK") {
      this.setPages(this.state.pages.concat(result.pages));
    }
  };

  startScanbotCroppingButtonTapped = async () => {
    if (!this.checkSelectedOriginal()) { return; }

    const result = await ScanbotSDK.UI.startCroppingScreen(this.state.selectedPage, {
      doneButtonTitle: 'Apply',
      topBarBackgroundColor: '#c8193c'
    });
    this.debugLog(`CroppingScreen result: ${JSON.stringify(result)}`);

    if (result.status === "OK") {
      this.updatePage(result.page);
    }
  };

  gotoImageFilterPage = () => {
    if (!this.checkSelectedDocument()) { return; }

    this.props.navigator.push({
      screen: DemoScreens.ImageFilterDemoScreen.id,
      title: DemoScreens.ImageFilterDemoScreen.title,
      passProps: {
        page: this.state.selectedPage,
        onImageFilterApplied: this.onImageFilterApplied
      }
    });
  };

  onImageFilterApplied = async (page: Page) => {
    this.goBack();
    this.debugLog('page with applied image filter: ' + JSON.stringify(page));
    this.updatePage(page);
  };

  pickImageTapped = () => {
    // Open photo gallery to select an image and run document detection on it
    this.props.navigator.push({
      screen: DemoScreens.CameraKitGalleryDemoScreen.id,
      title: DemoScreens.CameraKitGalleryDemoScreen.title,
      passProps: {
        onImageSelected: this.onGalleryImageSelected,
      }
    });
  };

  onGalleryImageSelected = async (imageFileUri: String) => {
    this.goBack();
    try {
      this.showSpinner();
      // create a page of the original selected image:
      const pageWithOriginalImage = await ScanbotSDK.createPage(imageFileUri);
      this.onStoredPageSelected(pageWithOriginalImage);
      // and run auto document detection and cropping on it:
      const pageWithDocImage = await ScanbotSDK.detectDocumentOnPage(pageWithOriginalImage);
      this.updatePage(pageWithDocImage);
    } finally {
      this.hideSpinner();
    }
  };

  onStoredPageSelected = (page: Page) => {
    const {pages} = this.state;
    if (!_.find(pages, p => p.pageId == page.pageId)) {
      pages.push(page);
    }
    this.setState({pages, selectedPage: page});
  };

  createPDFButtonTapped = async () => {
    if (!this.checkAllDocumentImages(true)) { return; }

    this.showSpinner();
    try {
      const imageUris = this.state.pages.map(p => p.documentImageFileUri || p.originalImageFileUri);
      const result = await ScanbotSDK.createPDF(imageUris);
      this.debugLog('createPDF result: ' + JSON.stringify(result));
      this.delayedAlert('PDF created', result.pdfFileUri);
    } finally {
      this.hideSpinner();
    }
  };

  createTiffTapped = async () => {
    if (!this.checkAllDocumentImages(true)) { return; }

    this.showSpinner();
    try {
      const imageUris = this.state.pages.map(p => p.documentImageFileUri || p.originalImageFileUri);
      const result = await ScanbotSDK.writeTIFF(imageUris, {oneBitEncoded: true});
      this.debugLog('writeTiff result: ' + JSON.stringify(result));
      this.delayedAlert('TIFF created', result.tiffFileUri);
    } finally {
      this.hideSpinner();
    }
  };

  resetSelectedPages = () => {
    this.setState({
      pages: [],
      selectedPage: null,
    })
  };

  sdkCleanupButtonTapped = async () => {
    this.resetSelectedPages();
    await ScanbotSDK.cleanup();
    this.debugLog("Cleanup finished");
  };

  rotateImageCWButtonTapped = () => {
    this.rotateImage(-1);
  };

  rotateImageCCWButtonTapped = () => {
    this.rotateImage(1);
  };

  rotateImage = async (times: Number) => {
    if (!this.checkSelectedOriginal()) { return; }

    this.showSpinner();

    try {
      const {selectedPage} = this.state;
      const page = await ScanbotSDK.rotatePage(selectedPage, times);
      this.updatePage(page);
    } finally {
      this.hideSpinner();
    }
  };

  checkAllDocumentImages = () => {
    const {pages} = this.state;
    if (pages.length > 0 && _.every(pages, p => p && p.documentImageFileUri)) {
      return true;
    } else {
      Alert.alert('Document image required', "Some selected images have not yet been cropped. Crop any remaining uncropped images and try again.");
      return false;
    }
  };

  checkSelectedDocument = () => {
    const {selectedPage} = this.state;
    if (selectedPage && selectedPage.documentImageFileUri) {
      return true;
    } else {
      Alert.alert('Document image required', 'Snap a document or crop an image that was chosen from the gallery.');
      return false;
    }
  };

  checkSelectedOriginal = () => {
    const {selectedPage} = this.state;
    if (selectedPage) {
      return true;
    } else {
      Alert.alert('Image required', 'Snap a document or open one from the gallery.');
      return false;
    }
  };

  goBack() {
    this.props.navigator.pop({
      animated: true
    });
  }

  updatePage = (newPage: Page) => {
    const {pages} = this.state;
    const i = _.findIndex(pages, p => p.pageId == newPage.pageId);
    if (i !== -1) {
      pages[i] = newPage;
    }

    this.setPages(pages, newPage);
  };

  setPages = (pages: Page[], selectedPage: Page) => {
    this.setState({
      pages: pages,
      selectedPage: selectedPage ? _.find(pages, p => p.pageId == selectedPage.pageId) : _.last(pages)
    });
  };

  renderPickedImages() {
    let {pages} = this.state;
    if (pages) {
      return pages.map((p, i) => <TouchableHighlight key={i} onPress={() => this.onPickedImageSelected(p)}>
          <Image
            style={styles.galleryImage}
            source={{uri:p.documentPreviewImageFileUri || p.originalPreviewImageFileUri}}
          />
        </TouchableHighlight>);
    }
  }

  onPickedImageSelected = (page: Page) => {
    this.setState({selectedPage: page});
  };

  renderDocumentImage() {
    let {selectedPage, filterPreviewUri} = this.state;
    if (selectedPage) {
      return <Image
        style={styles.documentImage}
        source={{uri:filterPreviewUri || selectedPage.documentPreviewImageFileUri || selectedPage.originalPreviewImageFileUri}}
        />;
    }
  }

  showSpinner() {
    this.setState({spinnerVisible: true});
  }

  hideSpinner() {
    this.setState({spinnerVisible: false});
  }

  debugLog(msg: String) {
    console.log(msg);
    this.setState({
      debugText: msg
    });
  }

  delayedAlert(title: string, message: string) {
    setTimeout(() => {Alert.alert(title, message);}, 500);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexDirection: 'row',
    backgroundColor: '#F5FCFF',
    margin: 5,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    margin: 10,
  },
  infoblock: {
    textAlign: 'center',
    backgroundColor: '#aaa',
    margin: 10,
    height: 100,
    textAlignVertical: 'center'
  },
  demoButtonPanel: {
    margin: 10,
  },
  documentImage: {
    width: 400,
    height: 400,
    resizeMode: 'contain',
  },
  galleryImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
  debugOutputHeader: {
    margin: 10,
    fontWeight: 'bold',
  },
  debugOutputContent: {
    margin: 10,
    marginTop: 0,
    fontFamily: 'Courier',
  },
});
