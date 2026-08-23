<div id="fullcenter">

<?
if (isset($message))
	echo $message;
if (isset($itemMinersByCity) and count($itemMinersByCity))
{
	echo $form->create(null, array('action' => 'auto_trash'));
	foreach($itemMinersByCity as $cityName => $itemMiners)
	{
		echo $cityName;
		$checked = true;
		echo $itemList->itemTableCheckbox($itemMiners, $rarityColors, $isAdministrator, $checked);
	}
	echo $form->end('Trash Selected');
}
?>

</div>