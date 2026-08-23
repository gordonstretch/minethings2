<body style="padding:0px">

<? echo $javascript->link('prototype1.6.1/prototype.js'); ?>
<? echo $javascript->link('scriptaculous1.8.3/scriptaculous.js'); ?>
<? echo $html->css($stylesCSS); ?>
<? echo $html->css($profileCSS); ?>

<div style="display:none"> <?
$formOpen = $ajax->form('js_avatar', 'post', array(
	'model' => 'Miner',
	'update' => array('ProfileImageDiv', 'SaveDiv'),
	'id' => 'ProfileImageForm',
	'indicator' => 'IndicatorDiv',
	))."\n";	

//$formOpen = $form->create('Miner', array('action' => 'js_avatar'));
echo $formOpen;

$radioOptions = array();
foreach($imageElementTypes as $type => $elements)
{
	$radioOptions = array();
	foreach($elements['iaes'] as $id => $iae)
		$radioOptions[$id] = $iae['name'];
	$radioOptions[0] = 'None';
	if (isset($elements['selected']))
		$attributes = array('value' => $elements['selected']);
	else
		$attributes = array();
	echo $form->radio('ItemsAvatarElement.'.$type, $radioOptions, $attributes )."\n";// , array('value' => $elements['selected']))."\n";
}

echo $form->checkbox('Avatar.save', array('id' => 'AvatarSave', 'value' => 0))."\n";
echo $form->input('Miner.id', array('type' => 'hidden'))."\n";

echo $form->end(array(
	'label' => 'submit',
	'id' => 'ElementSubmitButton',
	))."\n"; 
	
?> </div>

<div class="ae_main">
	<h2 class="ae_title">Avatar Editor</h2>

	<? echo $javascript->link('Tabbox'); ?>
	<script type="text/JavaScript">
		var box = new Tabbox("profile_tabs", { header: "h3", autosize: true })
	</script>      

	<div class="profile_tabs_wrapper">
		<div class="profile_tabs" id="profile_tabs">
			<?
			$first = true;
			foreach($imageElementTypes as $type => $elements)
			{
				if ($first)
					$classes = 'selected first';
				else
					$classes = '';
				$first = false;
				echo '<div class="tabPanel '.$classes.'">';
				echo '<h3><a href="#">'.$type.'</a></h3>';
				//echo '<h3><a href="#'.$type.'Tab">'.$type.'</a></h3>';
				echo '<div class="tabContent" id="'.$type.'Tab">';
				echo '<ul>';
				if (count($elements['iaes']) == 18)
					$liClass='col3';
				else
					$liClass='col4';

				foreach($elements['iaes'] as $iaeId => $ie)
				{
					if ($ie['name'] == 'Undiscovered')
					{
						$ie['name'] = '['.strtolower($ie['name']).']';
						echo '<li class="'.$liClass.' item-grey">'.$ie['name']."</li>";
					}
					else
					{
						$name = $ie['name'];
						if ($type != 'Models')
							$name = preg_replace('# \w+$#', '', $ie['name']);
						$name = substr($name, 0, 11);

						$id = 'ItemsAvatarElement'.$type.$iaeId;
						$onclick = "$('$id').checked = true; $('ElementSubmitButton').click(); return false;";
						$rarityClass = $itemList->GetRarityClass($ie['rarity']);
						$icon = $ie['locked'] ? 'broken.png' : $ie['icon'];
						echo '<li class="'.$liClass.' item-'.$rarityClass.'" >
						<a href="javascript:void(0);" style="background-image:url('.$html->base.'/app/webroot/img/icons/'.$icon.')" onclick="'.$onclick.'" >'.$name.'</a></li>';
					}
				}
				echo '<li class="'.$liClass.'"><a href="javascript:void(0);" onclick="$(\'ItemsAvatarElement'.$type.'0\').checked = true; $(\'ElementSubmitButton\').click(); return false;" >No '.$type.'</a></li>';
				
				echo '</ul>';
				echo '</div>';
				echo '</div>';
			}
			?>
		</div>
		<div class="avatar_save">
			<?
			$Clear = "";
			foreach($avatarElements as $a)
				$Clear .= "$('ItemsAvatarElement".$a."0').checked = true; ";
			?>
			<div id="SaveDiv" style="display:inline; float:right">
				<a href="javascript:void(0);" class="accept" onclick="$('AvatarSave').checked = true; $('ElementSubmitButton').click(); return false; ">Save</a>
			</div>
			<a href="javascript:void(0);" class="cancel" onclick="parent.Lightview.hide(); return false;">Cancel</a>
			<a href="javascript:void(0);" class="new" onclick="<? echo $Clear; ?> $('ElementSubmitButton').click(); return false; ">New</a>
		</div>
		<div class="clear"></div>
	</div>

	<div class="ae_image">
		<div id="ProfileImageDiv"><? echo $html->image('avatars/composed/'.$avatar); ?></div>
		<div id="IndicatorDiv" style="display:none">loading...</div>
	</div>


</div>

</body>
