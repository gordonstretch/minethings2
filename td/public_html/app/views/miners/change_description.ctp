<body style="margin:0px;padding:0px">
<?
echo $javascript->link('prototype1.6.1/prototype.js');
echo $javascript->link('scriptaculous1.8.3/scriptaculous.js');
echo $javascript->link('textCounter.js');
echo $html->css($profileCSS);
echo $html->css($stylesCSS);

echo '<div class="description_main">';

echo '<div style="text-align:center"><span  id="textCounter">'.($charLimit-strlen($this->data['Profile']['description'])).'</span> characters left</div>';

$formOpen = $ajax->form('change_description', 'post', array(
	'model' => 'Profile',
	'id' => 'DescriptionForm',
	'indicator' => 'IndicatorDiv',
	'complete' => 'parent.location.reload();',
	))."\n";	
//$formOpen = $form->create(NULL, array('action' => 'change_description'));
echo $formOpen;
	
echo $form->input('Profile.description', array(
	'type' => 'textbox', 
	'rows' => 18, 
	'cols' => 60, 
	'div' => array('style' => 'margin-left:10px'),
	'onKeyDown' => "OnChar(this, $charLimit)", 
	'label' => false));

echo $form->end(array(
	'label' => 'submit',
	'id' => 'SubmitButton',
	'style' => 'display:none;',
	))."\n"; 
?>

<div class="description_save">


<a href="javascript:void(0);" class="accept" onclick="$('SubmitButton').click(); return false; ">Save</a>
<a href="javascript:void(0);" class="cancel" onclick="parent.Lightview.hide(); return false;">Cancel</a>

<span style="float:right; margin-right:10px;"><div id="IndicatorDiv" style="float:right; display:none">updating...</div></span>

</div>

<div style="clear:both" />

</div> <!-- description_main -->

</body>