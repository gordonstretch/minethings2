<div id="fullcenter">

<? echo $javascript->link('attach_cannons.js');?>

<H2>Attach/Detach Cannons</H2>
to/from <? echo $shipName; ?> in <? echo $cityName; ?> <? echo $html->link('[back to status]', '/vehicles/check_status/'.$minersVehicleId); ?>


<div style="float:right">
<a href="#" onclick="$('ConfirmDetachForm').show(); return false;">Detach All Cannons</a>
<div id="ConfirmDetachForm" style="display:none">
<?
echo $ajax->form(NULL, 'post', array(
	'url' => array('action' => 'js_detach_cannons'),
	'update' => 'ConfirmDetachForm',
	));
echo $form->input('MinersVehicle.id', array('type' => 'hidden', 'value' => $minersVehicleId));
echo $form->input('MinersShip.id', array('type' => 'hidden', 'value' => $minersShipId));
echo $form->end(array('label' => 'Detach All Cannons'));
?>
</div>
<BR><BR>
<a href="#" onclick="$('ConfirmDeleteForm').show(); return false;">Delete Ship and Cannons</a>
<div id="ConfirmDeleteForm" style="display:none">
<?
echo $ajax->form(NULL, 'post', array(
	'url' => array('action' => 'js_delete_ship'),
	'update' => 'ConfirmDeleteForm',
	));
echo $form->input('MinersVehicle.id', array('type' => 'hidden', 'value' => $minersVehicleId));
echo $form->input('MinersShip.id', array('type' => 'hidden', 'value' => $minersShipId));
echo $form->end(array('label' => 'Delete Ship and Cannons'));
?>
</div>

</div>


<H3>Cannons already attached:</H3>
<?
	echo $cannon->CannonTable($cannonsOnShip, false);
?>

<H3>Cannons in <? echo $cityName; ?>:</H3>
<?
	echo $form->create(null, array('action' => 'attach_cannons', 'id' => 'VehicleAttachCannonsForm'));
	echo $form->input("MinersVehicle.id", array('type' => 'hidden', 'value' => $minersVehicleId));
	$checkboxes = $cannon->CannonTable($cannonsInCity, true);
	$checkboxes = preg_replace('/(type="checkbox")/', '\1 onclick="UpdateCapacity(forms[\'VehicleAttachCannonsForm\']);"', $checkboxes);
	echo $checkboxes;
	echo 'Cannon Portals remaining: <script language="Javascript">PrintCapacity('.$cannonPortalsRemaining.'); </script><BR>';
	echo $form->end(array('label' => 'Attach Selected', 'name' => 'attach_button'));
?>

</div>