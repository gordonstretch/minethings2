<script><? // script for facebook like button ?>
  window.fbAsyncInit = function() {
    FB.init({
      appId      : '53384806244',
      xfbml      : true,
      version    : 'v2.2'
    });
	
  };

  (function(d, s, id){
     var js, fjs = d.getElementsByTagName(s)[0];
     if (d.getElementById(id)) {return;}
     js = d.createElement(s); js.id = id;
     js.src = "//connect.facebook.net/en_US/sdk.js";
     fjs.parentNode.insertBefore(js, fjs);
   }(document, 'script', 'facebook-jssdk'));
</script>


<div id="fb-root"></div>
<script>(function(d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) return;
  js = d.createElement(s); js.id = id;
  js.src = "//connect.facebook.net/en_US/sdk.js#xfbml=1&appId=53384806244&version=v2.0";
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));</script>


<div id="fullcenter">


<h3>Earn Credits when you Recruit!</h3>

<p><b>Earn credits when you share Minethings with others. </b></p>

<span style="padding:5px; font-size:20px; background-color:#b0c0b0;"><b>Your Recruit Link:</b> <input onclick="this.select();" style="line-height: 2em;" size="50" value="<? echo $recruitmentUrl; ?>" /></span>
<BR>
<BR>
<span style="font-size:20px; background-color:#b0c0b0;"><b>Facebook Version:</b> <div class="fb-share-button" data-href="<? echo $recruitmentUrl; ?>" data-layout="button" data-width="500"></div></span>

<p>This link is unique to your account.  Copy and paste it onto your facebook status, website, profile, signature or wherever you want.  <B>You'll earn 1/3 of all credits</B> that your recruits purchase! </p>

<p>Here are some variations you can also use.</p>

<table>
<tr><th>HTML Code</th><th>Preview</th></tr>

<!-- plain link -->
<tr valign="top">
<? $code = "<a href=\"$recruitmentUrl\">Free Browser Game</a>"; ?>
<td><textarea onclick="this.select();" rows="3" cols="40"><? echo $code; ?></textarea></td>
<td><? echo $code; ?></td>
</tr>

<!-- logo -->
<tr valign="top">
<? $code = "<a href=\"$recruitmentUrl\"><img src=\"$logoUrl\" alt=\"Free Browser Game\" /></a>"; ?>
<td><textarea onclick="this.select();" rows="3" cols="40"><? echo $code; ?></textarea></td>
<td><? echo $code; ?></td>
</tr>
</table>

<?
foreach($ads as $a)
{
	$code = "<a href=\"$recruitmentUrl\"><img src=\"$a\" alt=\"Free Browser Game\" /></a>";
	print '<textarea onclick="this.select();" rows="3" cols="40">'.$code.'</textarea>'.$code."<BR><BR>";

}
?>


</table>

<p><b>Note</b> Please do not post at <b>/r/incremental/games</b>; they have heard quite enough about Minethings.</p>

<p>You have recruited <? echo $recruitmentCount; ?> miner(s).</p>

<p>Recruits will remain anonymous for the sake of their privacy.</p>

</div>
