<?if ($success): ?>
<SCRIPT type="text/javascript">
window.location = "/vehicles/attach_cannons/<?echo $minersVehicleId;?>";
</SCRIPT>
<?else:
echo $message;
endif; ?>